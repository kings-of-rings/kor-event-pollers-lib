type PollContractData = {
	contractName: string;
	contractAddress: string;
	lastBlockPolled: number;
	maxBlocksQuery: number;
	paused: boolean;
	rpcUrl: string;
}