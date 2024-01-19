import * as admin from "firebase-admin";

type ContractData = {
  address: string;
  lastBlockPolled: number;
}

export class ERC20PollManager {
  chainId: number;
  contractDir: string;
  constructor(chainId: number, isTestNet: boolean) {
    this.chainId = chainId;
    this.contractDir = isTestNet ? "erc20_testnet" : "erc20_mainnet";
  };

  async checkContracts(db: admin.firestore.Firestore) {
    const contractsToPoll = await this._getContractsToPoll(db);
    for (const contract of contractsToPoll) {
      await this._saveRequest(contract, db);
    }
  }

  async _getContractsToPoll(db: admin.firestore.Firestore): Promise<ContractData[]> {
    const listToReturn: ContractData[] = [];
    const collectionRef = db.collection(`directory/${this.contractDir}/contracts`);
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
    const ref = db.collection(`polling/${this.contractDir}/transfers`).doc(contract.address);
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







