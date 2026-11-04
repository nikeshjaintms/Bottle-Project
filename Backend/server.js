require("dotenv").config();
const app = require("./src/app");
const connectDB = require("./src/config/db");
const seedRBAC = require("./src/seeders/rbac.seeder");
const { reconcileAllActiveStock } = require("./src/utils/stockRecompute");
const { syncAllChallansToDispatch } = require("./src/services/deliveryChallanDispatchSync.service");

const PORT = process.env.PORT || 5000;

connectDB().then(async () => {
    seedRBAC();
    await reconcileAllActiveStock();
    await syncAllChallansToDispatch();
});

app.listen(PORT, () => {
    console.log(`server is running on port ${PORT}`);
});
