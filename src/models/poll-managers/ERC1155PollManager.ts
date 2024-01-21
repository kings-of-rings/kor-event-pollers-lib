import * as admin from "firebase-admin";

type ContractData = {
  address: string;
  lastBlockPolled: number;
}

export class ERC1155PollManager {
  chainId: number;
  directoryDoc: string;
  pollingPath: string;
  constructor(chainId: number, isTestNet: boolean) {
    this.chainId = chainId;
    this.directoryDoc = isTestNet ? "erc1155_testnet" : "erc1155_mainnet";
    this.pollingPath = isTestNet ? "polling/erc1155/transfers_testnet" : "polling/erc1155/transfers_mainnet";
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
    const ref = db.collection(this.pollingPath).doc(contract.address); const result = await ref.get();
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
  static async checkContracts(chainId: number, isTestNet: boolean, db: admin.firestore.Firestore): Promise<ERC1155PollManager> {
    const itemToReturn = new ERC1155PollManager(chainId, isTestNet);
    await itemToReturn.checkContracts(db);
    return itemToReturn;
  }
}







