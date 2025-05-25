const express = require("express");
const axios = require("axios");
require("dotenv").config();
const fs = require("fs");
const app = express();
const getSheetData = require("./sheetReader");
const FormData = require("form-data");
const path = require("path");
const logger = require("./logger");

// const SHEET_ID = "1FbTLrux9rpYKN3yRqvc3bLKdFvrG7ELvamQGwD644sU";
// const SHEET_RANGE = "TESTING";

const SHEET_ID = "1FbTLrux9rpYKN3yRqvc3bLKdFvrG7ELvamQGwD644sU";
const SHEET_RANGE = "CDATA!A1:Z1000";

const { CLIENT_ID, CLIENT_SECRET, REDIRECT_URI } = process.env;

const { Vimeo } = require("@vimeo/vimeo");
const { exit, title } = require("process");
const { Console } = require("console");

const vimeoClient = new Vimeo(
  process.env.VIMEO_CLIENT_ID,
  process.env.VIMEO_CLIENT_SECRET,
  process.env.VIMEO_ACCESS_TOKEN
);
const VIMEO_ACCESS_TOKEN = process.env.VIMEO_ACCESS_TOKEN;
let ZOOM_ACCESS_TOKEN = "";
let ZOOM_REFRESH_TOKEN = "";

// PID

const courseIds = {
  APC: 23275333,
  DIAV: 23275009,
  DICA: 23276548,
  DIEM: 23189928,
  DIFD: 23239308,
  DIHM: 23234633,
  DIID: 23243780,
  DIJD: 23241429,
  DIMP: 23275692,
  DIN: 23237496,
  DIP: 23954309,
  DITT: 23275500,
  Makeup: 23275884,
  "Real Estate": 23637036,
};

// Step 1: Redirect user to Zoom OAuth
app.get("/auth", (req, res) => {
  const zoomAuthUrl = `https://zoom.us/oauth/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}`;
  res.redirect(zoomAuthUrl);
});

// Step 2: Exchange auth code for token
app.get("/callback", async (req, res) => {
  const code = req.query.code;
  const encodedAuth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString(
    "base64"
  );

  try {
    const tokenRes = await axios.post("https://zoom.us/oauth/token", null, {
      params: {
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
      },
      headers: {
        Authorization: "Basic " + encodedAuth,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    console.log(`code: ${code}, redirect_uri: ${REDIRECT_URI}`);

    ZOOM_ACCESS_TOKEN = tokenRes.data.access_token;
    ZOOM_REFRESH_TOKEN = tokenRes.data.refresh_token;
    console.log("New access token:", ZOOM_ACCESS_TOKEN);
    console.log("New refresh token:", ZOOM_REFRESH_TOKEN);
    // setInterval(refreshZoomToken, 1 * 60 * 1000);
    res.redirect(`/recordings?token=${ZOOM_ACCESS_TOKEN}`);
  } catch (error) {
    console.error(
      "❌ Token Exchange Error:",
      error.response?.data || error.message
    );
    res.status(500).send("Token exchange failed.");
  }
});

async function refreshZoomAccessToken() {
  if (!ZOOM_REFRESH_TOKEN) {
    console.error("❌ No refresh token available.", ZOOM_REFRESH_TOKEN);
    return;
  }
  if (!ZOOM_ACCESS_TOKEN) {
    console.error("❌ No access token available.", ZOOM_ACCESS_TOKEN);
    return;
  }
  try {
    const encodedAuth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString(
      "base64"
    );
    const response = await axios.post("https://zoom.us/oauth/token", null, {
      params: {
        grant_type: "refresh_token",
        refresh_token: ZOOM_REFRESH_TOKEN,
      },
      headers: {
        Authorization: "Basic " + encodedAuth,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    // Save the new tokens
    ZOOM_ACCESS_TOKEN = response.data.access_token;

    console.log(
      "refreshZoomAccessToken()",
      "Access token refreshed:",
      ZOOM_ACCESS_TOKEN,
      "refresh token:",
      response.data.refresh_token,
      "refresh token:",
      ZOOM_REFRESH_TOKEN
    );
  } catch (error) {
    console.error(
      "Error refreshing Zoom access token:",
      error.response?.data || error.message
    );
  }
}

function uploadToVimeo(filePath, title) {
  return new Promise((resolve, reject) => {
    vimeoClient.upload(
      filePath,
      {
        name: title,
        privacy: { view: "unlisted" }, // Optionally set privacy
      },
      function (uri) {
        console.log(`✅ Uploaded to Vimeo at: https://vimeo.com${uri}`);
        resolve(`https://vimeo.com${uri}`);
      },
      function (bytesUploaded, bytesTotal) {
        const percentage = ((bytesUploaded / bytesTotal) * 100).toFixed(2);
        process.stdout.write(`\r🔼 Uploading: ${percentage}%`);
      },
      function (error) {
        console.error("\n❌ Vimeo Upload Error:", error);
        reject(error);
      }
    );
  });
  // return true;
}

async function moveVideoToFolder(parentFolderId, subFolderName, videoUri) {
  console.log(parentFolderId, subFolderName, videoUri);
  try {
    const videoId = videoUri.split("/").pop();
    console.log("🎯 Extracted videoId:", videoId);

    // Step 2: Get subfolders inside parent folder
    const subfoldersRes = await axios.get(
      `https://api.vimeo.com/me/projects/${parentFolderId}/items`,
      {
        headers: {
          Authorization: `Bearer ${VIMEO_ACCESS_TOKEN}`,
        },
      }
    );
    console.log("subfolders response: ", subfoldersRes.data.data);

    const subfolder = subfoldersRes.data.data.find(
      (item) =>
        item.type === "folder" &&
        typeof item.folder?.name === "string" &&
        item.folder.name.trim().toLowerCase() ===
          subFolderName.trim().toLowerCase()
    );
    console.log("subfolder: ", subfolder);

    if (!subfolder) {
      throw new Error(
        `❌ Subfolder "${subFolderName}" not found inside "${parentFolderId}".`
      );
    }

    const subfolderId = subfolder.folder.uri.split("/").pop();
    console.log("subfolderId: ", subfolderId);

    // Step 3: Move video to subfolder
    const uploadResponse = await axios.put(
      `https://api.vimeo.com/me/projects/${subfolderId}/videos/${videoId}`,
      {},
      {
        headers: {
          Authorization: `Bearer ${VIMEO_ACCESS_TOKEN}`,
        },
      }
    );
    console.log("Upload response: ", uploadResponse);
    if (uploadResponse.status !== 204) {
      throw new Error("❌ Failed to move video to subfolder.");
    }

    console.log(
      `✅ Moved video ${videoId} to subfolder "${subFolderName}" inside "${parentFolderId}"`
    );
  } catch (error) {
    console.error(
      "❌ Error moving video to folder:",
      error.response?.data || error.message
    );
    throw error;
  }
}

// Pass only videoUri, parentFolderName, and subfolderName
// moveVideoToFolder(25118489, "Batch-13", "/videos/1079843799");

// Main function: Full flow
// async function updateVideoTitle(filePath, title) {
//   try {
//     const videoUri = await uploadToVimeo(filePath, title);
//     await moveVideoToFolder(25118489, "Batch-13", videoUri);
//     console.log("🎉 Video upload and folder move complete!");
//   } catch (error) {
//     console.error("❌ Error in full flow:", error);
//   }
// }

// const filePath =
//   "./downloads/DIEM-Budgeting_for_Print,_Television_and_Radio_MP4_2025-04-19T05-22-34-000Z.mp4";
// const videoTitle = "Budgeting for Print, Television, and Radio";

// updateVideoTitle(filePath, videoTitle);

// Function to handle Zoom recording fetching, downloading, and uploading to Vimeo

const downloadRecordings = async (
  meetingId,
  token,
  batchNumber,
  programName,
  videoTitle
) => {
  try {
    // Fetch Zoom meeting recordings
    const recordingRes = await axios.get(
      `https://api.zoom.us/v2/meetings/${meetingId}/recordings`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const { topic, recording_files } = recordingRes.data;

    if (!recording_files || recording_files.length === 0) {
      return "❌ No recordings found for this meeting.";
    }

    setInterval(refreshZoomAccessToken, 1 * 60 * 1000);

    // Iterate over each recording file
    for (const file of recording_files) {
      if (file.file_type === "MP4") {
        const timestamp = new Date(file.recording_start)
          .toISOString()
          .replace(/[:.]/g, "-");
        const safeTopic = topic
          .replace(/[<>:"/\\|?*]+/g, "")
          .replace(/\s+/g, "_");
        const filename = `${safeTopic}_${
          file.file_type
        }_${timestamp}.${file.file_type.toLowerCase()}`;
        const downloadUrl = `${file.download_url}?access_token=${token}`;

        // Download the recording file temporarily to your server (or you can use direct streaming if possible)
        const fileStream = fs.createWriteStream(filename);
        const fileRes = await axios.get(downloadUrl, {
          responseType: "stream",
        });

        fileRes.data.pipe(fileStream);

        await new Promise((resolve) => {
          fileStream.on("finish", async () => {
            fileStream.close();
            // Upload the video to Vimeo directly into the folder
            try {
              const videoUrl = await uploadToVimeo(filename, videoTitle);
              console.log(`✅ Video uploaded to Vimeo: ${videoUrl}`);
              await moveVideoToFolder(
                courseIds[programName],
                `Batch-${batchNumber}`,
                videoUrl
              );
            } catch (uploadError) {
              console.error("❌ Error uploading to Vimeo:", uploadError);
            }
            resolve();
          });
        });
        break;
      }
    }
    return "✅ All files downloaded and uploaded to Vimeo directly into the folder successfully.";
  } catch (error) {
    console.error(
      "❌ Error fetching/downloading recordings:",
      error.response?.data || error.message,
      "\n📛 Full Error:",
      error.toJSON?.() || error
    );
    throw new Error("Error fetching/downloading Zoom recordings.");
  }
};

app.get("/batch-download", async (req, res) => {
  try {
    const rows = await getSheetData(SHEET_ID, SHEET_RANGE);
    if (!Array.isArray(rows)) {
      throw new Error("Sheet data is not an array. Check getSheetData output.");
    }
    console.log("📄 Sheet data:", rows);
    console.log("📄 Sheet data length:", rows.length);

    // Skip header row
    for (let i = 1; i < rows.length; i++) {
      console.log("📄 Row:", rows[i]);
      const row = rows[i];
      let meetingId = row[4];
      const batchNumber = row[2];
      const programName = row[1];
      const videoTitle = `AO${row[0]}${programName}-B${batchNumber}-T${row[3]}-${row[4]}${row[5]}${row[6]}-ILL-W${row[7]}`;

      logger.error(
        `meeting id: ${meetingId}, batchNumber: ${batchNumber}, programName: ${programName}, title: ${videoTitle}`
      );

      // Clean up
      meetingId = meetingId.toString().replace(/\s+/g, "");
      // console.log("📞 Fetching recordings for Meeting ID:", meetingId);

      // Construct title
      // const title = "AO-TESTING";
      if (meetingId) {
        // console.log("📞 Meeting ID:", meetingId);
        ZOOM_ACCESS_TOKEN = ZOOM_ACCESS_TOKEN || process.env.ZOOM_ACCESS_TOKEN;
        const videoResp = await downloadRecordings(
          meetingId,
          ZOOM_ACCESS_TOKEN,
          batchNumber,
          programName,
          videoTitle
        );
        console.log("✅ Video response:", videoResp, "----------");
        // Optional delay
        await new Promise((resolve) => setTimeout(resolve, 2000));
        // break;
      }
    }

    res.send("✅ Triggered recordings processing for all rows.");
  } catch (error) {
    console.error(
      "❌ Error reading Google Sheet:",
      error.stack || error.message || error
    );
    res.status(500).send("Failed to read Google Sheet.");
  }
});

app.listen(3000, () =>
  console.log("🚀 Server running at http://localhost:3000")
);
