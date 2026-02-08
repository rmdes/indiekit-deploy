// Generate a short-lived JWT token for internal API calls
const jwt = require("jsonwebtoken");
const fs = require("fs");

const secret = process.env.SECRET || fs.readFileSync("/data/config/.secret", "utf8").trim();
const siteUrl = process.env.SITE_URL;
const scope = process.argv[2] || "update";

const token = jwt.sign(
  { me: siteUrl, scope },
  secret,
  { expiresIn: "5m" }
);

process.stdout.write(token);
