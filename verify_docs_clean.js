const { google } = require('googleapis');
const { authorize } = require('./src/auth');
require('dotenv').config();

async function checkDoc() {
    try {
        const auth = await authorize();
        const docs = google.docs({ version: 'v1', auth });
        const documentId = process.env.GOOGLE_DOC_ID;
        const doc = await docs.documents.get({ documentId });
        console.log('--- Document Content Snapshot ---');
        console.log('Title:', doc.data.title);
        const content = doc.data.body.content;
        let foundSymbol = false;
        content.forEach(element => {
            if (element.paragraph) {
                const text = element.paragraph.elements.map(e => e.textRun?.content).join('');
                if (text.includes('#') || text.includes('##') || text.includes('###')) {
                    // Filter out some common characters like # in AliExpress or something if needed
                    // but usually these symbols #, ##, ### at start are what we want to find.
                    if (/^#+|^\s*#+/.test(text)) {
                        console.log('FOUND SYMBOL:', text.trim());
                        foundSymbol = true;
                    }
                }
                if (text.includes('4월 3주차')) {
                    console.log('REPORT HEADER FOUND:', text.trim());
                }
            }
        });
        if (!foundSymbol) console.log('CLEAN! No Markdown symbols (#) found in headers.');
        else console.log('SYMBOLS STILL EXIST.');
    } catch (err) {
        console.error('Error reading doc:', err.message);
    }
}

checkDoc();
