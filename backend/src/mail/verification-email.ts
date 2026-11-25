const title = 'Подтвердите почту';
const description = 'После подтверждения вы сможете войти в аккаунт.';
const expiry = 'Ссылка действует 24 часа.';
const footer = 'Если это не вы, проигнорируйте письмо.';

export function verificationEmail(url: string, logoContentId: string): { text: string; html: string } {
  const link = url
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

  return {
    text: [title, '', description, url, '', expiry, footer].join('\n'),
    html: `<!doctype html>
<html lang="ru">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head>
<body style="margin:0;color:#15213b;font-family:Arial,sans-serif">
  <table role="presentation" align="center" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="max-width:480px;margin:0 auto;text-align:left;border:1px solid #dce4f1;border-radius:16px;border-collapse:separate">
    <tr><td bgcolor="#edf2ff" style="padding:12px 24px;border-radius:15px 15px 0 0;background-color:#edf2ff">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0">
        <tr>
          <td><img src="cid:${logoContentId}" width="44" height="44" alt="" style="display:block;border:0"></td>
          <td style="padding-left:8px;color:#15213b;font-size:21px;line-height:26px;font-weight:bold;letter-spacing:-0.5px">yaneMedia</td>
        </tr>
      </table>
    </td></tr>
    <tr><td style="padding:24px">
      <h1 style="margin:0 0 10px;color:#15213b;font-size:28px;line-height:34px;letter-spacing:-0.5px">${title}</h1>
      <p style="margin:0 0 22px;color:#344561;font-size:16px;line-height:24px">${description}</p>
      <table role="presentation" cellspacing="0" cellpadding="0" border="0">
        <tr><td bgcolor="#1235ee" style="border-radius:10px;background-color:#1235ee">
          <a href="${link}" style="display:inline-block;padding:12px 20px;color:#ffffff;font-size:16px;line-height:22px;font-weight:bold;text-decoration:none">Подтвердить почту</a>
        </td></tr>
      </table>
      <p style="margin:14px 0 0;color:#475875;font-size:14px;line-height:21px">${expiry} <a href="${link}" style="display:inline-block;color:#1235c8;text-decoration:underline">Запасная ссылка</a></p>
    </td></tr>
    <tr><td style="padding:14px 24px;border-top:1px solid #e4ebf5;color:#475875;font-size:13px;line-height:20px">${footer}</td></tr>
  </table>
</body>
</html>`,
  };
}
