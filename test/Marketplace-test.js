const { expect } = require("chai");
const { fromRpcSig } = require("ethereumjs-util");
const { signTypedData_v4 } = require("eth-sig-util");
require('dotenv').config();
const ethers = hre.ethers;

let , ;
let ERC20, ERC20;
let Marketplace, Marketplace;
let WithUser;
let msgParams;
let tokenIds;
let amounts;

const TRANSFER_AMOUNT = ethers.utils.parseUnits("100", "ether");
const LIST_SALE = ethers.utils.parseUnits("1", "ether");
const SALE_REWARD = ethers.utils.parseUnits("0.98", "ether");

describe(" Marketplace", function() {
  beforeEach(async function () {
    accounts = await ethers.getSigners();
    owner = accounts[0];
    whitelist = accounts[1];
    user = accounts[2];

    ownerAddress = await owner.getAddress();
    whitelistAddress = await whitelist.getAddress();
    userAddress = await user.getAddress();

    ERC20 = await ethers.getContractFactory("ERC20");
    ERC20 = await ERC20.deploy("10000000");
    await ERC20.deployed();

     = await ethers.getContractFactory("ERC1155");
     = await .deploy(
      ownerAddress,
      "https://us-central1--59655.cloudfunctions.net/tokenData?tokenId={id}",
    );
    await .deployed();

    Marketplace = await ethers.getContractFactory("Marketplace");
    Marketplace = await Marketplace.deploy(
      ownerAddress,
      500,
      [ERC20.address],
      .address
    );
    await Marketplace.deployed();
    
    await ERC20.transfer(userAddress, TRANSFER_AMOUNT);
    const primaryType = 'Bid';
    tokenIds = [1, 2];
    amounts = [1, 1];
    nonce = await Marketplace.nonces(1);
    msgParams = {
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      Bid: [
        { name: 'auctionId', type: 'uint256' },
        { name: 'tokenIds', type: 'uint256[]' },
        { name: 'amounts', type: 'uint256[]' },
        { name: 'bidder', type: 'address' },
        { name: 'price', type: 'uint256' },
        { name: 'token', type: 'address' },
        { name: 'nonce', type: 'uint256' },
      ],
    },
    primaryType: primaryType,
    domain: { name: 'Marketplace', chainId: 31337, verifyingContract: Marketplace.address },
    message: { 
      auctionId: 1,
      tokenIds: tokenIds,
      amounts: amounts,
      bidder: userAddress,
      price: "1000000000000000000",
      token: ERC20.address,
      nonce: nonce.toNumber(),
    },
  };
  });
  it("Should list  sale", async function() {
    await .mint(1, "nft one", "wow first nft", "url");

    expect(await .balanceOf(ownerAddress, 1)).to.equal(1);

    await expect(
      await Marketplace.listNewSale(["1"], ["1"], LIST_SALE)
    ).to.emit(Marketplace, "ListSale");

    await expect(
      Marketplace.listNewSale(["1"], ["1"], "0")
    ).to.be.reverted;
  });
  it("Should cancel listing", async function() {
    await .mint(1, "nft one", "wow first nft", "url");

    await expect(
      await Marketplace.listNewSale(["1"], ["1"], LIST_SALE)
    ).to.emit(Marketplace, "ListSale");

    await expect(
      await Marketplace.cancelSale(1)
    ).to.emit(Marketplace, "CancelSale");
  });
  it("Should buy NFT", async function() {
    await .mint(1, "nft one", "wow first nft", "url");
    await Marketplace.listNewSale(["1"], ["1"], LIST_SALE);
    await .setApprovalForAll(Marketplace.address, true);
    await expect(
      await Marketplace.connect(user).buyFromSale(1, {value: LIST_SALE})
    ).to.emit(Marketplace, "CompleteSale");

    expect(await .balanceOf(ownerAddress, 1)).to.equal(0);
    expect(await .balanceOf(userAddress, 1)).to.equal(1);
  });
  it("Should buy collection of NFTs", async function() {
    await .mintBatch([1, 2], ["nft one", "nft two"], ["wow first nft", "wow 2nd nft"], ["url", "url2"]);
    await Marketplace.listNewSale(["1", "2"], ["1", "1"], LIST_SALE);
    await .setApprovalForAll(Marketplace.address, true);
    await expect(
      await Marketplace.connect(user).buyFromSale(1, {value: LIST_SALE})
    ).to.emit(Marketplace, "CompleteSale");

    expect(await .balanceOf(ownerAddress, 1)).to.equal(0);
    expect(await .balanceOf(ownerAddress, 2)).to.equal(1);
    expect(await .balanceOf(userAddress, 1)).to.equal(1);
    expect(await .balanceOf(userAddress, 1)).to.equal(1);
  });
  it("Should buy from auction", async function() {
    await .mintBatch([1, 2], ["nft one", "nft two"], ["wow first nft", "wow 2nd nft"], ["url", "url2"]);
    await ERC20.connect(user).approve(Marketplace.address, await ERC20.totalSupply());
    await .setApprovalForAll(Marketplace.address, true);
    // const signature = await user._signer._signTypedData(msgParams.domain, msgParams.types, msgParams.message);
    const signature = signTypedData_v4(Buffer.from(process.env.USER_PRIVATE_KEY, "hex"),{ data: msgParams })
    const { v, r, s } = fromRpcSig(signature);
    const struct = [1, tokenIds, amounts, userAddress, "1000000000000000000", ERC20.address, nonce];
    await Marketplace.sellerClaimBySig(struct, v, r, s);
    expect(await .balanceOf(ownerAddress, 1)).to.equal(0);
    expect(await .balanceOf(ownerAddress, 2)).to.equal(1);
    expect(await .balanceOf(userAddress, 1)).to.equal(1);
    expect(await .balanceOf(userAddress, 1)).to.equal(1);
  });
});
