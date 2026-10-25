/** Query parameters that can start /u/login, reduced to one validated-later `next` target. */
export interface LoginParams {
  next: string | null;
  email: string;
  hasError: boolean;
  isSamlContinuation: boolean;
}

type Lookup = { get(name: string): string | null };

const NONCE = /^[\w-]{8,128}$/;

export function parseLoginParams(params: Lookup, apiBase: string): LoginParams {
  const saml = params.get("saml_continue");
  const samlNext = saml && NONCE.test(saml) ? `${apiBase.replace(/\/$/, "")}/saml/sso/continue/${encodeURIComponent(saml)}` : null;
  return {
    next: samlNext ?? params.get("continue") ?? params.get("next"),
    email: params.get("email") ?? "",
    hasError: params.get("error") !== null,
    isSamlContinuation: samlNext !== null,
  };
}
