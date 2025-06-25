export default function handler(req, res) {
  const { client_id, redirect_uri, scope, state } = req.query;
  
  const authCode = 'slack_mcp_' + Date.now();
  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set('code', authCode);
  if (state) redirectUrl.searchParams.set('state', state);
  
  res.redirect(302, redirectUrl.toString());
}
