import { Database } from "sqlite3";
import { loadOrders } from "./orders";
import { loadTransfers } from "./transfers";
import { loadOrderCancellations } from "./cancelled-orders";
const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./database.db") as Database;

// Opensea Event Types
//  {
//     "eventTypes": [
//       "created",
//       "offer_entered",
//       "bid_withdrawn",
//       "transfer",
//       "cancelled"
//     ]
//   }

// Some Rinkeby Collections
// cryptokitties: 0x16baf0de678e52367adc69fd067e5edd1d33e3bf
// deans nft collection: 0x67558f629c7330070e11234636d0b71289085487

const go = async () => {
  const contractAddress = "0x16baf0de678e52367adc69fd067e5edd1d33e3bf";

  await initDb();

  // Load orders
  let offset = 0;
  const limit = 50;
  let lastReadCount = 0;
  do {
    lastReadCount = await loadOrders(db, contractAddress, offset, limit);
    offset += limit;
  } while (lastReadCount != 0);

  // Load transfers
  offset = 0;
  lastReadCount = 0;
  do {
    lastReadCount = await loadTransfers(db, contractAddress, offset, limit);
    offset += limit;
  } while (lastReadCount != 0);

  // Load order cancellations
  offset = 0;
  lastReadCount = 0;
  do {
    lastReadCount = await loadOrderCancellations(
      db,
      contractAddress,
      offset,
      limit
    );
    offset += limit;
  } while (lastReadCount != 0);

  console.log("");
  console.log("--------------------------------------------------");
  console.log(`Valid Opensea Sell Orders for ${contractAddress}`);
  console.log("===================================================");
  const orders = await selectValidSellOrders(contractAddress);
  console.log(JSON.stringify(orders, null, 4));
};

const selectValidSellOrders = (contractAddress: string) => {
  return new Promise((resolve, reject) => {
    db.all(
      `
    SELECT *
    from orders o
    JOIN asset_activity aa ON o.contract_address = aa.contract_address AND o.token_id = aa.token_id
    WHERE 
    (datetime(o.created_date) > DATETIME(aa.last_cancelled_date) OR aa.last_cancelled_date IS NULL)
    AND (datetime(o.created_date) > DATETIME(aa.last_transfer_date) OR aa.last_transfer_date IS NULL)
    AND (datetime(o.expiration_date) > DATETIME('now') OR o.expiration_date IS NULL)
    AND o.contract_address = $contractAddress
    `,
      {
        $contractAddress: contractAddress,
      },
      function (err: unknown, res: unknown) {
        if (err) {
          console.error(err);
          reject(err);
          return;
        }
        resolve(res);
      }
    );
  });
};

const initDb = async () => {
  //   const a = await selectOrders();
  //   console.log(a);
  db.run(
    "CREATE TABLE IF NOT EXISTS orders (event_id INTEGER PRIMARY KEY ASC, created_date TEXT NOT NULL, expiration_date TEXT, contract_address TEXT NOT NULL, token_id TEXT NOT NULL)"
  );

  db.run(
    "CREATE TABLE IF NOT EXISTS asset_activity (contract_address TEXT NOT NULL, token_id TEXT NOT NULL, last_transfer_date TEXT, last_cancelled_date TEXT, PRIMARY KEY (contract_address, token_id))"
  );
};

go();
