const express = require("express");
const axios = require("axios");
require("dotenv").config();
const fs = require("fs");
const app = express();
const getSheetData = require("./sheetReader");
const logger = require("./logger");

const SHEET_ID = "1FbTLrux9rpYKN3yRqvc3bLKdFvrG7ELvamQGwD644sU";
const SHEET_RANGE = "CDATA!A1:Z1000";

const { CLIENT_ID, CLIENT_SECRET, REDIRECT_URI } = process.env;

const { Vimeo } = require("@vimeo/vimeo");

const vimeoClient = new Vimeo(
  process.env.VIMEO_CLIENT_ID,
  process.env.VIMEO_CLIENT_SECRET,
  process.env.VIMEO_ACCESS_TOKEN
);
const VIMEO_ACCESS_TOKEN = process.env.VIMEO_ACCESS_TOKEN;
let ZOOM_ACCESS_TOKEN = "";

// PID
const courseIds = {
  APC: 23275333,
  AVX: 23275009,
  CUL: 23276548,
  EMG: 23189928,
  FDN: 23239308,
  HSM: 23234633,
  IDN: 23243780,
  JDN: 23241429,
  MPD: 23275692,
  NTD: 23237496,
  PSY: 23954309,
  TRT: 23275500,
  MKP: 23275884,
  DIREM: 23637036,
};

const months = {
  1: "Jan",
  2: "Feb",
  3: "Mar",
  4: "Apr",
  5: "May",
  6: "Jun",
  7: "Jul",
  8: "Aug",
  9: "Sep",
  10: "Oct",
  11: "Nov",
  12: "Dec",
};

// Step 1: Redirect user to Zoom OAuth
app.get("/auth", (req, res) => {
  const zoomAuthUrl = `https://zoom.us/oauth/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}`;
  res.redirect(zoomAuthUrl);
});

app.get("/regenerate-token", async (req, res) => {
  try {
    const encodedAuth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString(
      "base64"
    );
    const response = await axios.post("https://zoom.us/oauth/token", null, {
      params: {
        grant_type: "refresh_token",
        refresh_token: process.env.ZOOM_REFRESH_TOKEN,
      },
      headers: {
        Authorization: "Basic " + encodedAuth,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    // Save the new tokens
    ZOOM_ACCESS_TOKEN = response.data.access_token;

  
    res.redirect(`/batch-download`);
  } catch (error) {
    console.error(
      "Error refreshing Zoom access token:",
      error.response?.data || error.message
    );
  }
});

app.get("/callback_A", async (req, res) => {
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

    ZOOM_ACCESS_TOKEN = tokenRes.data.access_token;
   
    res.redirect(`/batch-download`);
  } catch (error) {
    console.error(
      "❌ Token Exchange Error:",
      error.response?.data || error.message
    );
    res.status(500).send("Token exchange failed.");
  }
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

   

    ZOOM_ACCESS_TOKEN = tokenRes.data.access_token;
   
    res.redirect(`/batch-download`);
  } catch (error) {
    console.error(
      "❌ Token Exchange Error:",
      error.response?.data || error.message
    );
    res.status(500).send("Token exchange failed.");
  }
});

async function refreshZoomAccessToken() {
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
        refresh_token: process.env.ZOOM_REFRESH_TOKEN,
      },
      headers: {
        Authorization: "Basic " + encodedAuth,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    // Save the new tokens
    ZOOM_ACCESS_TOKEN = response.data.access_token;

  
  } catch (error) {
    console.error(
      "Error refreshing Zoom access token:",
      error.response?.data || error.message
    );
  }
}

async function uploadToVimeo(filePath, title) {
  return new Promise((resolve, reject) => {
    vimeoClient.upload(
      filePath,
      {
        name: title,
        privacy: { view: "anybody" }, // Optionally set privacy
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

  try {
    const videoId = videoUri.split("/").pop();
    

    // Step 2: Get subfolders inside parent folder
    const subfoldersRes = await axios.get(
      `https://api.vimeo.com/me/projects/${parentFolderId}/items`,
      {
        headers: {
          Authorization: `Bearer ${VIMEO_ACCESS_TOKEN}`,
        },
      }
    );

    const subfolder = subfoldersRes.data.data.find(
      (item) =>
        item.type === "folder" &&
        typeof item.folder?.name === "string" &&
        item.folder.name.trim().toLowerCase() ===
          subFolderName.trim().toLowerCase()
    );
    if (!subfolder) {
      throw new Error(
        `❌ Subfolder "${subFolderName}" not found inside "${parentFolderId}".`
      );
    }

    const subfolderId = subfolder.folder.uri.split("/").pop();
   

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
   
    if (uploadResponse.status !== 204) {
      throw new Error("❌ Failed to move video to subfolder.");
    }
   

    console.log(
      `✅ Moved video ${videoId} to subfolder "${subFolderName}" inside "${parentFolderId}"`
    );
  } catch (error) {
    logger.error(
      `error while moving video from: parentFolder: ${parentFolderId}, subFolder: ${subFolderName}, error: ${
        error.response?.data?.message || error.message
      }`
    );
    console.error(
      "❌ Error moving video to folder:",
      error.response?.data || error.message
    );
    throw error;
  }
}

// Function to handle Zoom recording fetching, downloading, and uploading to Vimeo

const downloadRecordings = async (
  meetingId,
  token,
  batchNumber,
  programName,
  videoTitle
) => {
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

  // Iterate over each recording file
  for (const file of recording_files) {  
    if (
      file.file_type === "MP4" &&
      file.recording_type === "shared_screen_with_speaker_view"
    ) {
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
              batchNumber,
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
};

app.get("/batch-download", async (req, res) => {
  try {
    const rows = await getSheetData(SHEET_ID, SHEET_RANGE);
    if (!Array.isArray(rows)) {
      throw new Error("Sheet data is not an array. Check getSheetData output.");
    }


    setInterval(refreshZoomAccessToken, 55 * 60 * 1000);

    // Skip header row
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      let meetingId = row[4];
      const batchNumber = row[2];
      const programName = row[1];
      const videoTitle = `AO${row[0]}${programName}-B${row[9]}-T${row[3]}-${
        row[5]
      }${months[row[6]]}${row[7]}-ILL-W${row[8]}`;

      if (!meetingId || !programName) {
        logger.error(
          `meeting id: ${meetingId}, batchNumber: ${batchNumber}, programName: ${programName}, title: ${videoTitle}`
        );
        continue;
      }

      console.log(
        `meeting id: ${meetingId}, batchNumber: ${batchNumber}, programName: ${programName}, title: ${videoTitle}`
      );

      // Clean up
      meetingId = meetingId.toString().replace(/\s+/g, "");

      if (meetingId) {
        ZOOM_ACCESS_TOKEN = ZOOM_ACCESS_TOKEN || process.env.ZOOM_ACCESS_TOKEN;
        try {
          const videoResp = await downloadRecordings(
            meetingId,
            ZOOM_ACCESS_TOKEN,
            batchNumber,
            programName,
            videoTitle
          );
          // Optional delay
          await new Promise((resolve) => setTimeout(resolve, 2000));
        } catch (error) {
          logger.error(
            `error while fetching meeting id: ${meetingId}, batchNumber: ${batchNumber}, programName: ${programName}, title: ${videoTitle}, error: ${
              error.response?.data?.message || error.message
            }`
          );
          console.error(
            "❌ Error fetching/downloading recordings:",
            error.response?.data || error.message,
            "\n📛 Full Error:",
            error.toJSON?.() || error
          );
          console.error(
            "📛 Full error response:",
            error.response?.data || error.message,
            "\n📛 Stack:",
            error.stack || error.toJSON?.() || error
          );
          // continue;
          throw new Error("Error fetching/downloading Zoom recordings.");
        }
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
