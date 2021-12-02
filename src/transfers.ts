import { AssetEvent, EventsResponse } from "../types";
import { selectAssetActivity, withThrottledRetries } from "./utils";
import axios from "axios";
import { Database } from "sqlite3";
import { isAfter, parseISO } from "date-fns";

export const loadTransfers = async (
  db: Database,
  contractAddress: string,
  offset: number,
  limit: number
): Promise<number> => {
  const response = await withThrottledRetries(() =>
    axios.get(
      `https://testnets-api.opensea.io/api/v1/events?asset_contract_address=${contractAddress}&only_opensea=false&offset=${offset}&limit=${limit}&event_type=cancelled`
    )
  );

  const data: EventsResponse = response.data;

  for (const event of data.asset_events) {
    await updateLastTransfer(db, event);
  }

  return data.asset_events.length;
};

const updateLastTransfer = async (db: Database, event: AssetEvent) => {
  if (!event.asset) {
    // this is a bundle, i think we need to handle this
    return;
  }

  console.log("UPDATING LAST TRANSFER: ", {
    id: event.id,
    tokenId: event.asset.token_id,
    transferDate: event.created_date,
  });

  const assetActivity = await selectAssetActivity(
    db,
    event.asset.asset_contract.address,
    event.asset.token_id
  );

  // If we have a more recent last_transfer_date, then update it
  if (assetActivity) {
    let doUpdate = !assetActivity.last_transfer_date;

    if (assetActivity.last_transfer_date) {
      const currentLastTransferDate = parseISO(
        assetActivity.last_transfer_date
      );
      const incomingLastTransferDate = parseISO(event.created_date);
      doUpdate = isAfter(incomingLastTransferDate, currentLastTransferDate);

      if (doUpdate) {
        console.log("more recent transfer date", {
          currentLastTransferDate,
          incomingLastTransferDate,
        });
      }
    }

    if (doUpdate) {
      console.log("updating...");
      return new Promise((resolve, reject) => {
        db.run(
          `UPDATE asset_activity
                  SET last_transfer_date = $lastTransferDate
                  WHERE contract_address = $contractAddress
                  AND token_id = $tokenId
                  `,
          {
            $contractAddress: event.asset.asset_contract.address,
            $tokenId: event.asset.token_id,
            $lastTransferDate: event.created_date,
          },
          (err: unknown, result: unknown) => {
            if (err) reject(err);
            else resolve(result);
          }
        );
      });
    } else {
      console.log("skipping...");
    }

    return;
  }

  console.log("inserting...");
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO
            asset_activity (contract_address, token_id, last_transfer_date)
            VALUES ($contractAddress, $tokenId, $transferDate)
            ON CONFLICT DO NOTHING
          `,
      {
        $contractAddress: event.asset.asset_contract.address,
        $tokenId: event.asset.token_id,
        $transferDate: event.created_date,
      },
      (err: unknown, result: unknown) => {
        if (err) reject(err);
        else resolve(result);
      }
    );
  });
};
