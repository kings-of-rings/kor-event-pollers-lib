import * as admin from "firebase-admin";

type ContractData = {
  address: string;
  lastBlockPolled: number;
}

export class ERC20PollManager {
  chainId: number;
  directoryDoc: string;
  pollingPath: string;
  constructor(chainId: number, isTestNet: boolean) {
    this.chainId = chainId;
    this.directoryDoc = isTestNet ? "erc20_testnet" : "erc20_mainnet";
    this.pollingPath = isTestNet ? "polling/erc20/transfers_testnet" : "polling/erc20/transfers_mainnet";
  };

  async checkContracts(db: admin.firestore.Firestore) {
    const contractsToPoll = await this._getContractsToPoll(db);
    for (const contract of contractsToPoll) {
      await this._saveRequest(contract, db);
    }
  }

  async _getContractsToPoll(db: admin.firestore.Firestore): Promise<ContractData[]> {
    const listToReturn: ContractData[] = [];
    const collectionRef = db.collection(`directory/${this.directoryDoc}/contracts`);
    const queryRef = collectionRef.orderBy("lastBlockPolled", "asc").limit(5);
    const querySnapshot = await queryRef.get();
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const address = data.address;
      const lastBlockPolled = data.lastBlockPolled;
      listToReturn.push({ address, lastBlockPolled });
    });
    return listToReturn;
  }

  async _saveRequest(contract: ContractData, db: admin.firestore.Firestore): Promise<void> {
    const ref = db.collection(this.pollingPath).doc(contract.address);
    const result = await ref.get();
    if (result.exists) { 
      await ref.delete();
    }
    const data = {
      address: contract.address,
      lastBlockPolled: contract.lastBlockPolled,
      chainId: this.chainId,
    };
    await ref.set(data);
  }
}

export class ERC20PollManagerFactory {
  static async checkContracts(chainId: number, isTestNet: boolean, db: admin.firestore.Firestore): Promise<ERC20PollManager> {
    const itemToReturn = new ERC20PollManager(chainId, isTestNet);
    await itemToReturn.checkContracts(db);
    return itemToReturn;
  }
}







