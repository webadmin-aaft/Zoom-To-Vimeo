const { google } = require("googleapis");
const fs = require("fs");
require("dotenv").config();

const auth = new google.auth.GoogleAuth({
  keyFile: "google-creds.json",
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});

async function getSheetData(spreadsheetId, range) {
  const client = await auth.getClient();
  const sheets = google.sheets({ version: "v4", auth: client });

  console.log("📄 Reading Google Sheet...");

  const res = await sheets.spreadsheets.values.get({
    // spreadsheetId: '1xxNGs9IYfRhv6401NBtlM57Oeyc9yMsUSm0tXOX27aU',
    // range: 'TESTING', // replace with actual tab name
    spreadsheetId,
    range,
  });

  // console.log("✅ Sheet data fetched:", res.data.values);

  return res.data.values;
}

module.exports = getSheetData;
