const { google } = require('googleapis');
const { authorize } = require('./auth');

async function findDocId(auth) {
    const drive = google.drive({ version: 'v3', auth });
    const res = await drive.files.list({
        q: "name = 'Weekly Newsletter Summary' and mimeType = 'application/vnd.google-apps.document'",
        fields: 'files(id, name)',
        pageSize: 1
    });

    const files = res.data.files;
    if (files.length) {
        console.log(`[Drive] 문서를 찾았습니다: ${files[0].name} (ID: ${files[0].id})`);
        return files[0].id;
    } else {
        console.log(`[Drive] 'Weekly Newsletter Summary' 문서를 찾을 수 없습니다.`);
        return null;
    }
}

module.exports = { findDocId };
