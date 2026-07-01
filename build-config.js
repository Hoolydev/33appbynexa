const fs = require("fs");

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

const config = `window.SUPABASE_CONFIG = ${JSON.stringify(
  {
    url: supabaseUrl,
    anonKey: supabaseAnonKey,
  },
  null,
  2
)};\n`;

fs.writeFileSync("supabase-config.js", config);

if (process.env.VERCEL === "1") {
  const emptyData = {
    generatedAt: new Date().toISOString(),
    sourceFiles: [],
    units: [],
    accreditation: {
      sourceFile: "Supabase",
      units: [],
      procedures: [],
    },
    modelTasks: [],
    purchaseItems: [],
    summary: {
      taskStatus: {},
      purchaseStatus: {},
      accreditationStatus: {},
    },
  };

  fs.writeFileSync(
    "data.js",
    `window.FRANCHISE_DATA = ${JSON.stringify(emptyData, null, 2)};\n`
  );
}
