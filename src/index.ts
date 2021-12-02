import { Database } from "sqlite3";
import axios, { AxiosError } from "axios";
import { AssetActivity, AssetEvent, EventsResponse } from "../types";
import { isAfter, parseISO } from "date-fns";
import { loadOrders } from "./orders";
import { loadTransfers } from "./transfers";
import { loadOrderCancellations } from "./cancelled-orders";
const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./database.db") as Database;

//  {
//     "eventTypes": [
//       "created",
//       "offer_entered",
//       "bid_withdrawn",
//       "transfer",
//       "cancelled"
//     ]
//   }

// cryptokitties: Q29sbGVjdGlvblR5cGU6MjEzMg

const go = async () => {
  const contractAddress = "0x381748c76f2b8871afbbe4578781cd24df34ae0d";

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
};

const selectOrders = () => {
  return new Promise((resolve) => {
    db.all("SELECT * FROM orders", function (err: any, res: any) {
      console.error(err);
      resolve(res);
    });
  });
};

const initDb = async () => {
  //   const a = await selectOrders();
  //   console.log(a);
  db.run(
    "CREATE TABLE IF NOT EXISTS orders (event_id INTEGER PRIMARY KEY ASC, created_date TEXT, contract_address TEXT, token_id TEXT)"
  );

  db.run(
    "CREATE TABLE IF NOT EXISTS asset_activity (contract_address TEXT, token_id TEXT, last_transfer_date TEXT, last_cancelled_date TEXT, PRIMARY KEY (contract_address, token_id))"
  );
};

go();
