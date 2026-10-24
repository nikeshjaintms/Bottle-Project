const fs = require("fs");
const path = require("path");

let logoDataUri;

function getChallanLogoDataUri() {
  if (!logoDataUri) {
    const logoPath = path.resolve(__dirname, "../../../admin panel/src/assets/hero.png");
    logoDataUri = `data:image/png;base64,${fs.readFileSync(logoPath).toString("base64")}`;
  }

  return logoDataUri;
}

module.exports = { getChallanLogoDataUri };
