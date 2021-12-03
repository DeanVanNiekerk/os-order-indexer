import { Database } from "sqlite3";
import { parseDate, withThrottledRetries } from "./utils";
import axios from "axios";
import { AssetEvent, EventsResponse } from "../types";
import { addSeconds } from "date-fns";

export const loadOrders = async (
  db: Database,
  contractAddress: string,
  offset: number,
  limit: number
): Promise<number> => {
  const response = await withThrottledRetries(() =>
    axios.get(
      `https://testnets-api.opensea.io/api/v1/events?asset_contract_address=${contractAddress}&only_opensea=false&offset=${offset}&limit=${limit}&event_type=created`
    )
  );

  const data: EventsResponse = response.data;

  for (const event of data.asset_events) {
    await addOrder(db, event);
  }

  return data.asset_events.length;
};

const addOrder = (db: Database, event: AssetEvent) => {
  if (!event.asset) {
    // this is a bundle, do we care?
    return;
  }

  console.log("INSERTING ORDER: ", {
    id: event.id,
    tokenId: event.asset.token_id,
    date: event.created_date,
    duration: event.duration,
  });

  let expirationDate: Date | null = null;

  if (event.duration) {
    expirationDate = addSeconds(parseDate(event.created_date), event.duration);
  }

  return new Promise((resolve, reject) => {
    db.run(
      "INSERT INTO orders (event_id, created_date, expiration_date, contract_address, token_id) VALUES ($eventId, $createdDate, $expirationDate, $contractAddress, $tokenId) ON CONFLICT DO NOTHING",
      {
        $eventId: event.id,
        $createdDate: parseDate(event.created_date).toISOString(),
        $expirationDate: expirationDate?.toISOString() ?? null,
        $contractAddress: event.asset.asset_contract.address,
        $tokenId: event.asset.token_id,
      },
      (err: unknown, result: unknown) => {
        if (err) reject(err);
        else resolve(result);
      }
    );
  });
};
