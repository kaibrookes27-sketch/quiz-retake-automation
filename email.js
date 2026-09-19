const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

// Update these once you've got a verified sending domain in Resend.
const FROM_ADDRESS = process.env.RESEND_FROM_ADDRESS || 'Mystery Manga Box <hello@mysterymanga.com>';
const QUIZ_URL = process.env.QUIZ_URL || 'https://mysterymanga.com/?open_quiz=1';

function buildEmailHtml(firstName) {
  const greeting = firstName ? `Hey ${firstName},` : 'Hey,';
  return `
<!DOCTYPE html>
<html>
  <body style="margin:0; padding:0; background:#141414; font-family:'Work Sans', Arial, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#141414;">
      <tr>
        <td align="center" style="padding:48px 20px;">
          <table role="presentation" width="100%" style="max-width:480px;" cellpadding="0" cellspacing="0">
            <tr>
              <td style="text-align:center; padding-bottom:28px;">
                <p style="color:#C1443A; font-size:12px; font-weight:600; letter-spacing:.1em; text-transform:uppercase; margin:0;">Mystery Manga Box</p>
              </td>
            </tr>
            <tr>
              <td style="background:rgba(255,255,255,.04); border:1px solid rgba(250,249,246,.12); border-radius:16px; padding:36px 30px;">
                <p style="color:#FAF9F6; font-size:16px; line-height:1.6; margin:0 0 18px;">${greeting}</p>
                <h1 style="font-family:Georgia, 'Fraunces', serif; font-weight:400; font-size:24px; line-height:1.3; color:#FAF9F6; margin:0 0 18px;">Your next box is being picked soon.</h1>
                <p style="color:rgba(250,249,246,.75); font-size:15px; line-height:1.65; margin:0 0 28px;">
                  Tastes change. Before we curate your next box, take a minute to update
                  your answers — genres, tone, anything you'd rather we avoid — so it's
                  picked around who you are right now, not who you were a month ago.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                  <tr>
                    <td style="background:#C1443A; border-radius:6px;">
                      <a href="${QUIZ_URL}" style="display:inline-block; padding:14px 30px; color:#FAF9F6; font-size:15px; font-weight:600; text-decoration:none;">Retake the quiz</a>
                    </td>
                  </tr>
                </table>
                <p style="color:rgba(250,249,246,.55); font-size:13px; line-height:1.6; margin:0;">
                  Also want a different box size this month? You can switch between
                  One Shot, Arc, and Saga from your account before your next box is picked.
                </p>
              </td>
            </tr>
            <tr>
              <td style="text-align:center; padding-top:28px;">
                <p style="color:rgba(250,249,246,.4); font-size:12px; margin:0;">Mystery Manga Box &middot; mysterymanga.com</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `.trim();
}

async function sendQuizRetakeEmail({ to, firstName }) {
  const { data, error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to,
    subject: 'Your next box is coming up — update your picks?',
    html: buildEmailHtml(firstName),
  });

  if (error) {
    throw new Error(`Resend send failed for ${to}: ${JSON.stringify(error)}`);
  }
  return data;
}

module.exports = { sendQuizRetakeEmail };
