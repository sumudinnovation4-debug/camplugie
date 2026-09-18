// GET /api/debug-env
// Never returns secret values themselves — only whether they're set, and
// whether the service role key can actually reach the database. Safe to
// leave deployed, but feel free to delete this file once things are working.
const { supabaseAdmin, setCors } = require('../_lib');

module.exports = async (req, res) => {
  setCors(res);

  const report = {
    PAYSTACK_SECRET_KEY_set: !!process.env.PAYSTACK_SECRET_KEY,
    SUPABASE_URL_set: !!process.env.SUPABASE_URL,
    SUPABASE_URL_value: process.env.SUPABASE_URL || null, // not secret, safe to show — compare this to your app's URL
    SUPABASE_SERVICE_ROLE_KEY_set: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  // Decode (not verify) the JWT payload to see what role it actually claims —
  // this settles definitively whether the anon key got pasted in by mistake,
  // without depending on any query that could look fine for other reasons.
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const parts = process.env.SUPABASE_SERVICE_ROLE_KEY.split('.');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
      report.SUPABASE_SERVICE_ROLE_KEY_decoded_role = payload.role || '(no role claim found)';
      report.SUPABASE_SERVICE_ROLE_KEY_project_ref = payload.ref || '(no ref claim found)';
    } catch (e) {
      report.SUPABASE_SERVICE_ROLE_KEY_decoded_role = `Could not decode as a JWT: ${e.message}`;
    }
  }

  if (!report.SUPABASE_URL_set || !report.SUPABASE_SERVICE_ROLE_KEY_set) {
    return res.status(200).json({ ...report, connection_test: 'skipped — env vars missing' });
  }

  try {
    const sb = supabaseAdmin();
    const { count, error } = await sb.from('profiles').select('*', { count: 'exact', head: true });
    if (error) {
      report.connection_test = 'FAILED';
      report.connection_error = error.message;
    } else {
      report.connection_test = 'SUCCESS';
      report.profiles_row_count = count;
    }
  } catch (err) {
    report.connection_test = 'FAILED';
    report.connection_error = err.message;
  }

  return res.status(200).json(report);
};
