const REFRESH_COOKIE = "sb-33doctor-refresh";
const REFRESH_MAX_AGE = 30 * 24 * 60 * 60;

function parseCookies(request) {
  return String(request.headers?.cookie || "")
    .split(";")
    .reduce((cookies, part) => {
      const separator = part.indexOf("=");
      if (separator < 0) return cookies;
      const key = part.slice(0, separator).trim();
      const rawValue = part.slice(separator + 1).trim();
      if (!key) return cookies;
      try {
        cookies[key] = decodeURIComponent(rawValue);
      } catch {
        cookies[key] = rawValue;
      }
      return cookies;
    }, {});
}

function refreshTokenCookie(request) {
  return parseCookies(request)[REFRESH_COOKIE] || "";
}

function cookieSecurityAttribute() {
  return process.env.VERCEL || process.env.NODE_ENV === "production" ? "; Secure" : "";
}

function setRefreshTokenCookie(response, token) {
  response.setHeader(
    "Set-Cookie",
    `${REFRESH_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/api/auth; Max-Age=${REFRESH_MAX_AGE}${cookieSecurityAttribute()}`,
  );
}

function clearRefreshTokenCookie(response) {
  response.setHeader(
    "Set-Cookie",
    `${REFRESH_COOKIE}=; HttpOnly; SameSite=Strict; Path=/api/auth; Max-Age=0${cookieSecurityAttribute()}`,
  );
}

module.exports = {
  clearRefreshTokenCookie,
  refreshTokenCookie,
  setRefreshTokenCookie,
};
