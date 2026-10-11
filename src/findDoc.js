const { google } = require('googleapis');
const { authorize } = require('./auth');

/**
 * 구글 문서의 링크 공유 권한(anyone/reader - 보기 전용)을 명시적으로 설정하여 모바일 앱 접근 오류를 방지하고 문서를 안전하게 보호합니다.
 */
async function ensureDocPermissions(auth, docId) {
    if (!docId) return;
    try {
        const drive = google.drive({ version: 'v3', auth });
        await drive.permissions.create({
            fileId: docId,
            requestBody: {
                role: 'reader',
                type: 'anyone'
            }
        });
        console.log(`[Drive Permission] 구글 문서 링크 공유 권한(anyone/reader, 보기 전용) 설정 완료`);
    } catch (err) {
        if (err.message && err.message.includes('Google Drive API has not been used')) {
            console.log(`[Drive Permission Info] ⚠️ Google Cloud Console에서 Google Drive API 활성화가 필요합니다.`);
        } else {
            console.log(`[Drive Permission Info] 권한 확인/설정 처리: ${err.message}`);
        }
    }
}

async function findDocId(auth) {
    try {
        const drive = google.drive({ version: 'v3', auth });
        const res = await drive.files.list({
            q: "name = 'Weekly Newsletter Summary' and mimeType = 'application/vnd.google-apps.document' and trashed = false",
            fields: 'files(id, name)',
            pageSize: 1
        });

        const files = res.data.files;
        let targetDocId = null;

        if (files && files.length) {
            console.log(`[Drive] 문서를 찾았습니다: ${files[0].name}`);
            targetDocId = files[0].id;
        } else {
            console.log(`[Drive] 'Weekly Newsletter Summary' 새 문서를 생성합니다...`);
            const docs = google.docs({ version: 'v1', auth });
            const createdDoc = await docs.documents.create({
                requestBody: { title: 'Weekly Newsletter Summary' }
            });
            console.log(`[Drive] 새 문서가 생성되었습니다: ${createdDoc.data.title}`);
            targetDocId = createdDoc.data.documentId;
        }

        if (targetDocId) {
            await ensureDocPermissions(auth, targetDocId);
        }

        return targetDocId;
    } catch (err) {
        console.log(`[FindDoc Error] ${err.message}`);
        return null;
    }
}

module.exports = { findDocId, ensureDocPermissions };
