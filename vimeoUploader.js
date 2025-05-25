const fs = require("fs");
const { Vimeo } = require("@vimeo/vimeo");
require("dotenv").config();

const client = new Vimeo(
  process.env.VIMEO_CLIENT_ID,
  process.env.VIMEO_CLIENT_SECRET,
  process.env.VIMEO_ACCESS_TOKEN
);

function uploadToVimeo(filePath, title, description = "") {
  return new Promise((resolve, reject) => {
    client.upload(
      filePath,
      {
        name: title,
        description: description,
        privacy: { view: "unlisted" } // or "anybody", "nobody"
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
}
