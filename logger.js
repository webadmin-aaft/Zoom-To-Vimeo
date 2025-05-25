const winston = require("winston");
const path = require("path");
const logDir = path.resolve(__dirname, "../logs");
const logger = winston.createLogger({
  level: "error",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: `${logDir}/error.log` }),
  ],
});
module.exports = logger;
