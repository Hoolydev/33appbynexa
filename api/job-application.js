const { getAdminClient, handleError, json, requestBody, requirePost } = require("./_lib/storage");

const STOP_WORDS = new Set([
  "para", "com", "uma", "que", "das", "dos", "de", "do", "da", "em", "e", "ou", "na", "no",
  "experiencia", "conhecimento", "habilidade", "desejavel", "obrigatorio", "anos", "area",
]);

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function keywords(value) {
  return [...new Set(normalize(value).split(/[^a-z0-9+#.]+/).filter((word) => word.length > 2 && !STOP_WORDS.has(word)))];
}

function heuristicAssessment(vacancy, application) {
  const requirements = keywords(`${vacancy.payload?.requirements || ""} ${vacancy.payload?.description || ""}`);
  const profileText = normalize(`${application.skills} ${application.summary}`);
  const matches = requirements.filter((word) => profileText.includes(word));
  const gaps = requirements.filter((word) => !profileText.includes(word)).slice(0, 5);
  const coverage = requirements.length ? matches.length / requirements.length : 0.55;
  const experienceBonus = Math.min(Number(application.experienceYears || 0) * 3, 15);
  const completeness = [application.skills, application.summary, application.resumeUrl].filter(Boolean).length * 4;
  const score = Math.max(20, Math.min(96, Math.round(coverage * 72 + experienceBonus + completeness)));
  return {
    score,
    strengths: matches.slice(0, 6),
    gaps,
    summary: matches.length
      ? `O perfil apresenta correspondência com ${matches.length} requisito(s) identificado(s) na vaga.`
      : "O perfil precisa de avaliação humana porque os requisitos descritos não aparecem claramente na candidatura.",
    provider: "heuristic",
  };
}

function responseText(payload) {
  return (payload.output || [])
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text)
    .join("");
}

async function aiAssessment(vacancy, application, fallback) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_SCORING_MODEL;
  if (!apiKey || !model) return fallback;
  try {
    const result = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        instructions: "Você avalia aderência profissional de forma objetiva. Não infira idade, gênero, raça, religião, deficiência ou qualquer atributo sensível. Retorne apenas evidências profissionais presentes no texto.",
        input: `VAGA\nTítulo: ${vacancy.title}\nRequisitos: ${vacancy.payload?.requirements || ""}\nDescrição: ${vacancy.payload?.description || ""}\n\nCANDIDATURA\nExperiência: ${application.experienceYears || 0} anos\nCompetências: ${application.skills}\nResumo: ${application.summary}`,
        text: {
          format: {
            type: "json_schema",
            name: "candidate_assessment",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                score: { type: "integer", minimum: 0, maximum: 100 },
                strengths: { type: "array", items: { type: "string" }, maxItems: 6 },
                gaps: { type: "array", items: { type: "string" }, maxItems: 6 },
                summary: { type: "string" },
              },
              required: ["score", "strengths", "gaps", "summary"],
            },
          },
        },
      }),
    });
    if (!result.ok) return fallback;
    const payload = await result.json();
    const assessment = JSON.parse(responseText(payload));
    return { ...assessment, provider: "openai" };
  } catch {
    return fallback;
  }
}

module.exports = async function handler(request, response) {
  if (!requirePost(request, response)) return;
  try {
    const body = requestBody(request);
    if (body.website) {
      json(response, 201, { ok: true });
      return;
    }
    const tenantCode = String(body.tenantCode || "").trim();
    const vacancyId = String(body.vacancyId || "").trim();
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const phone = String(body.phone || "").trim();
    const skills = String(body.skills || "").trim();
    const summary = String(body.summary || "").trim();
    if (!tenantCode || !vacancyId || !name || !email || !phone || !skills || !summary || !body.consent) {
      throw new Error("Preencha todos os campos obrigatórios e autorize o uso dos dados.");
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Informe um e-mail válido.");

    const client = getAdminClient();
    const { data: tenant, error: tenantError } = await client.from("tenants").select("id, code, name").eq("code", tenantCode).eq("status", "active").maybeSingle();
    if (tenantError) throw tenantError;
    if (!tenant) throw new Error("Franquia não encontrada.");
    const { data: activation, error: activationError } = await client.from("tenant_modules").select("status").eq("tenant_id", tenant.id).eq("module_code", "hr").maybeSingle();
    if (activationError) throw activationError;
    if (activation?.status !== "active") throw new Error("O recrutamento não está ativo para esta franquia.");
    const { data: vacancy, error: vacancyError } = await client.from("module_records").select("id, title, status, payload").eq("id", vacancyId).eq("tenant_id", tenant.id).eq("module_code", "hr").eq("record_type", "vacancy").eq("archived", false).maybeSingle();
    if (vacancyError) throw vacancyError;
    if (!vacancy || vacancy.status !== "Aberta" || vacancy.payload?.public === false) throw new Error("Esta vaga não está mais disponível.");

    const application = {
      email, phone, skills, summary,
      experienceYears: Math.max(0, Number(body.experienceYears || 0)),
      resumeUrl: String(body.resumeUrl || "").trim(),
    };
    const assessment = await aiAssessment(vacancy, application, heuristicAssessment(vacancy, application));
    const { error } = await client.from("module_records").insert({
      tenant_id: tenant.id,
      module_code: "hr",
      record_type: "candidate",
      title: name,
      status: "Triagem automática",
      payload: {
        ...application,
        vacancyId: vacancy.id,
        vacancyTitle: vacancy.title,
        score: assessment.score,
        analysisStrengths: assessment.strengths,
        analysisGaps: assessment.gaps,
        analysisSummary: assessment.summary,
        analysisProvider: assessment.provider,
        consentAt: new Date().toISOString(),
        source: "public-careers",
      },
    });
    if (error) throw error;
    json(response, 201, { ok: true });
  } catch (error) {
    handleError(response, error);
  }
};
