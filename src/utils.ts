import { AxiosError } from "axios";
import { Database } from "sqlite3";
import { AssetActivity } from "../types";

export const withThrottledRetries = async <Ret>(
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

export const selectAssetActivity = (
  db: Database,
  contractAddress: string,
  tokenId: string
): Promise<AssetActivity | undefined> => {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM asset_activity WHERE contract_address = "${contractAddress}" AND token_id = "${tokenId}"`,
      function (err: any, res: AssetActivity[]) {
        if (err) {
          console.error(err);
          reject(err);
          return;
        }
        resolve(res[0]);
      }
    );
  });
};
