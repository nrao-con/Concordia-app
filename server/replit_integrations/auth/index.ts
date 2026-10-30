export {
  setupAuth,
  isAuthenticated,
  isClerkAuthenticated,
  getAuthenticatedUserId,
  getRawClerkSubject,
  getCanonicalUserId,
  resolveCanonicalPrincipal,
} from "./replitAuth";
export { authStorage, type IAuthStorage } from "./storage";
export { registerAuthRoutes } from "./routes";
