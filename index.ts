import * as lowdb from "lowdb";
import axios, { AxiosError } from "axios";
import { EventsResponse, Database } from "./types";
import lodash from "lodash";
//@ts-ignore
import Stopwatch from "statman-stopwatch";

const adapter = new lowdb.JSONFile<Database>("./db.json");
const database = new lowdb.Low<Database>(adapter);

//  {
//     "eventTypes": [
//       "created",
//       "offer_entered",
//       "bid_withdrawn",
//       "transfer",
//       "cancelled"
//     ]
//   }

const loadEventTypes = async (
  contractAddress: string,
  offset: number,
  limit: number
): Promise<number> => {
  //&event_type=created
  const response = await withThrottledRetries(() =>
    axios.get(
      `https://testnets-api.opensea.io/api/v1/events?asset_contract_address=${contractAddress}&only_opensea=false&offset=${offset}&limit=${limit}`
    )
  );

  const data: EventsResponse = response.data;

  console.log(`${data.asset_events.length} events received`, {
    offset,
    limit,
  });

  const uniqueEventTypes = data.asset_events.reduce((p, c) => {
    return {
      ...p,
      [c.event_type]: true,
    };
  }, {});

  const db = lodash.chain(database.data);

  const eventTypes = db
    .get("eventTypes")
    .push(...Object.keys(uniqueEventTypes))
    .uniq();

  console.log({
    offset,
    limit,
    recieved: data.asset_events.length,
    eventTypes: Object.keys(uniqueEventTypes),
    allEventTypes: eventTypes.value(),
    lastCreatedData: data.asset_events[0]?.created_date,
  });

  if (database.data) database.data.eventTypes = eventTypes.value();

  database.write();

  return data.asset_events.length;
};

const withThrottledRetries = async <Ret>(
  func: () => Promise<Ret>,
  retries = 0
): Promise<Ret> => {
  try {
    const res = await func();
    return res;
  } catch (err) {
    const error = err as unknown as AxiosError;
    const throttled = error.response?.status === 429;
    if (!throttled) {
      console.error(`response error status: ${error.response?.status}`);
      console.error(
        `response error data: ${JSON.stringify(error.response?.data)}`
      );

      throw err;
    }
    if (retries >= 5) {
      throw new Error(`Maximum retries for requests to NFT index service`);
    }
    console.log(`throttled, retrying`, {
      retries,
    });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return withThrottledRetries(func, retries + 1);
  }
};

const go = async () => {
  const sw = new Stopwatch();
  sw.start();
  await initDb();
  let offset = 0;
  const limit = 50;
  let lastReadCount = 0;
  do {
    lastReadCount = await loadEventTypes(
      "0x299801f56f69297d9bcf221d73a2fa0a532ce772",
      offset,
      limit
    );
    offset += limit;
    const time = sw.read();
    const seconds = Math.floor((time / 1000) % 60);
    const minutes = Math.floor((time / (1000 * 60)) % 60);
    const hours = Math.floor((time / (1000 * 60 * 60)) % 24);
    console.log({
      split: `${hours}h ${minutes}m ${seconds}s`,
    });
  } while (lastReadCount != 0);
};

const initDb = async () => {
  await database.read();
  // If file.json doesn't exist, db.data will be null
  // Set default data
  database.data = database.data || { eventTypes: [] };
};

go();
