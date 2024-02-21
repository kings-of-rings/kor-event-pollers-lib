
import { AANFTClaimEvent, BANFTClaimEvent, NFTPClaimEvent, TokenDataSet } from "@kings-of-rings/kor-contract-event-data-models/lib";
import { ethers } from "ethers";
import * as admin from "firebase-admin";
import { throwErrorIfUndefined } from "../../utils/throwErrorUndefined";
const EVENTS_NFTS_ABI = [
	"event ClaimRequested(uint256 indexed claimId, address indexed claimingAddress, uint256[] tokenIds)"
];

const EVENTS_NFTP_ABI = [
	"event ClaimRequested(uint256 indexed claimId, address indexed claimingAddress, uint256 amount)"
];

export class SongbirdPollers {
	baClaimManagerAddress = "0xaA88dE5525f9970cC060A5620b6169327d0c4D65";
	aaClaimManagerAddress = "0x960119098b9bFd6201Ac24d866bf6FDD6198616B";
	nftpClaimManagerAddress = "0xAAff44Db5Aa1b3BC388973cC159265c16329cCd0";
	lastBlockPolled: number = 0;
	rpcUrl: string = "https://songbird-api.flare.network/ext/C/rpc";
	paused: boolean = false;
	db: admin.firestore.Firestore;
	provider?: ethers.providers.JsonRpcProvider;

	maxBlocksQuery = 1000;
	constructor(db: admin.firestore.Firestore) {
		this.db = db;
	};

	async pollBlocks() {

		await this._setProvider();
		if (!this.paused) {
			this.provider = throwErrorIfUndefined(this.provider, "No provider found") as ethers.providers.JsonRpcProvider;
			let currentBlock = await this.provider.getBlockNumber() - 1;
			console.log('Current Block2 ', currentBlock);
			const difference = currentBlock - this.lastBlockPolled;
			console.log('difference ', difference);
			if (difference > this.maxBlocksQuery) {
				currentBlock = this.lastBlockPolled + this.maxBlocksQuery;
			}
			await this._pollBlocksNFTp(currentBlock);
			await this._pollBlocksAA(currentBlock);
			await this._pollBlocksBA(currentBlock);
			this.lastBlockPolled = currentBlock - 1;	  // update contract last block polled
			const contractDoc = this.db.collection(`events/pollers/sgb`).doc('claimManagers');
			await contractDoc.update({
				lastBlockPolled: currentBlock,
			});
			return;
		}
	}


	async _pollBlocksNFTp(currentBlock: number) {
		console.log('Polling NFTP');
		const contract = new ethers.Contract(this.nftpClaimManagerAddress, EVENTS_NFTP_ABI, this.provider);
		const difference = currentBlock - this.lastBlockPolled;
		if (difference > this.maxBlocksQuery) {
			currentBlock = this.lastBlockPolled + this.maxBlocksQuery;
		}
		throwErrorIfUndefined(contract, "No contract found");
		const contractFilter = contract.filters.ClaimRequested();
		const logs = await contract.queryFilter(contractFilter, this.lastBlockPolled, currentBlock);

		console.log('NFTP Logs ', logs.length);
		for (const log of logs) {
			await this._saveNFTPClaimEvent(log);
		}
		return;
	}

	async _pollBlocksBA(currentBlock: number) {
		console.log('Polling BA');
		const contract = new ethers.Contract(this.baClaimManagerAddress, EVENTS_NFTS_ABI, this.provider);
		const difference = currentBlock - this.lastBlockPolled;
		if (difference > this.maxBlocksQuery) {
			currentBlock = this.lastBlockPolled + this.maxBlocksQuery;
		}
		throwErrorIfUndefined(contract, "No contract found");
		const contractFilter = contract.filters.ClaimRequested();
		const logs = await contract.queryFilter(contractFilter, this.lastBlockPolled, currentBlock);
		console.log('BA Logs ', logs.length);
		for (const log of logs) {
			await this._saveBAClaimEvent(log);
		}
		return;
	}

	async _pollBlocksAA(currentBlock: number) {
		console.log('Polling AA');
		const contract = new ethers.Contract(this.aaClaimManagerAddress, EVENTS_NFTS_ABI, this.provider);
		const difference = currentBlock - this.lastBlockPolled;
		if (difference > this.maxBlocksQuery) {
			currentBlock = this.lastBlockPolled + this.maxBlocksQuery;
		}
		throwErrorIfUndefined(contract, "No contract found");
		const contractFilter = contract.filters.ClaimRequested();
		const logs = await contract.queryFilter(contractFilter, this.lastBlockPolled, currentBlock);
		console.log('AA Logs ', logs.length);
		for (const log of logs) {
			await this._saveAAClaimEvent(log);
		}
		return;
	}

	async _setProvider(): Promise<ethers.providers.JsonRpcProvider | undefined> {
		try {
			const contractDoc = await this.db.collection(`events/pollers/sgb`).doc('claimManagers').get();
			const data = contractDoc.data();
			const rpcUrl = data?.rpcUrl;
			this.lastBlockPolled = data?.lastBlockPolled;
			this.aaClaimManagerAddress = data?.aaClaimManagerAddress.toLowerCase();
			this.baClaimManagerAddress = data?.baClaimManagerAddress.toLowerCase();
			this.nftpClaimManagerAddress = data?.nftpClaimManagerAddress.toLowerCase();
			this.maxBlocksQuery = data?.maxBlocksQuery || 1000;
			this.paused = data?.paused || false;
			throwErrorIfUndefined(rpcUrl, "No rpc url found");
			this.provider = new ethers.providers.JsonRpcProvider(rpcUrl);
			return this.provider;
		} catch (error) {
			console.log('Error ', error);
			return;
		}
	}

	async _saveNFTPClaimEvent(log: ethers.Event): Promise<unknown> {
		const event = new NFTPClaimEvent(log);
		const dataToSave = event.formatDataForSave();
		const pathToSave = event.pathToSave();
		return await this.db.doc(pathToSave).set(dataToSave, { merge: true });
	}
	async _saveAAClaimEvent(log: ethers.Event): Promise<unknown> {
		const event = new AANFTClaimEvent(log);
		const dataToSave = event.formatDataForSave();
		const pathToSave = event.pathToSave();
		return await this.db.doc(pathToSave).set(dataToSave, { merge: true });
	}
	async _saveBAClaimEvent(log: ethers.Event): Promise<unknown> {
		const event = new BANFTClaimEvent(log);
		const dataToSave = event.formatDataForSave();
		const pathToSave = event.pathToSave();
		return await this.db.doc(pathToSave).set(dataToSave, { merge: true });
	}

}

export class SongbirdPollersFactory {
	static async runPoller(db: admin.firestore.Firestore): Promise<SongbirdPollers> {
		const pollerInstance = new SongbirdPollers(db);
		await pollerInstance.pollBlocks();
		return pollerInstance;
	}
}
