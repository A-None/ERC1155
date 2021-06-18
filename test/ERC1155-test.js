const { expect } = require("chai");
const ethers = hre.ethers;

let , ;
let ERC20, ERC20;
let Collection, Collection;
let MockToken, mockToken;
let MockToken_2, mockToken_2;
let WithUser;

const lockPeriod = 3600;
const COLLECTABLE_1 = ethers.utils.parseUnits("1", "ether");
const COLLECTABLE_2 = ethers.utils.parseUnits("2", "ether");

describe("", function () {
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
      "https://us-central1--59655.cloudfunctions.net/api/tokenData?tokenId={id}",
    );
    await .deployed();

    MockToken = await ethers.getContractFactory("MockERC20");
    mockToken = await MockToken.deploy();
    await mockToken.deployed();

    MockToken_2 = await ethers.getContractFactory("MockERC20");
    mockToken_2 = await MockToken_2.deploy();
    await mockToken_2.deployed();

    Collection = await ethers.getContractFactory("Collection");
    Collection = await Collection.deploy(.address);
    await Collection.deployed();
    await .addWhitelistAddress([Collection.address]);
    await ERC20.addWhitelistAddress([Collection.address]);
    WithUser = .connect(user);
    CollectionWithUser = Collection.connect(user);
    WithWhitelist = .connect(whitelist);

    // addToCollection
    await .addWhitelistAddress([owner.address]);
    await .whitelistMintBatch([3, 1, 1],
      ["one", "two", "three"],
      ["creator one", "creator two", "creator three"],
      ["desc one", "desc two", "desc three"],
      ["https://i.redd.it/w3kr4m2fi3111.png", "https://i.redd.it/w3kr4m2fi3111.png", "https://i.redd.it/w3kr4m2fi3111.png"], 
      ethers.constants.AddressZero);
    await .setApprovalForAll(Collection.address, true);
    const timestamp = Math.floor(Date.now() / 1000);
    await Collection.addToCollection([1, 2, 3], [2, 1, 1], [ethers.constants.AddressZero, mockToken.address, mockToken_2.address], [COLLECTABLE_1, COLLECTABLE_2, COLLECTABLE_2], timestamp + lockPeriod);
  });
  it("Create and buy from collection", async function () {
    mockToken.transfer(user.address, COLLECTABLE_2);
    await expect(
      CollectionWithUser.buyCollectable(0, 1, {value: 0})
    ).to.be.reverted;
    // test buying an ETH payment collectable
    await CollectionWithUser.buyCollectable(0, 1, {value: COLLECTABLE_1});
    // test buying an ERC20 payment collectable
    await mockToken.connect(user).approve(Collection.address, COLLECTABLE_2);
    await CollectionWithUser.buyCollectable(1, 1);
    // revert due to all collectables being bought out
    await expect(
      CollectionWithUser.buyCollectable(1, 1)
    ).to.be.reverted;
    expect(await .balanceOf(Collection.address, 1)).to.equal(1);
    expect(await .balanceOf(userAddress, 1)).to.equal(1);
    expect(await .balanceOf(Collection.address, 2)).to.equal(0);
    expect(await .balanceOf(userAddress, 2)).to.equal(1);
  });
  it("Add to specific collection", async function () {
    await .whitelistMintBatch([1],
      ["four"],
      ["creator four"],
      ["desc four"],
      ["https://i.redd.it/w3kr4m2fi3111.png"], 
      ethers.constants.AddressZero);
    await Collection.addToRound(1, [4], [1], [ethers.constants.AddressZero], [COLLECTABLE_1]);
    const collectionQuery = await Collection.roundCollection(1, 3);
    expect(collectionQuery[0]).to.equal(4);
  });
  it("Collect ERC20 tokens", async function () {
    mockToken.transfer(user.address, COLLECTABLE_2);
    await mockToken.connect(user).approve(Collection.address, COLLECTABLE_2);
    await CollectionWithUser.buyCollectable(1, 1);
    const beforeBalance = await mockToken.balanceOf(ownerAddress);
    await Collection.withdrawERC20(mockToken.address);
    expect(await mockToken.balanceOf(ownerAddress)).to.be.above(beforeBalance);
  });
  it("Collect all ERC20 tokens", async function () {
    mockToken.transfer(user.address, COLLECTABLE_2);
    mockToken_2.transfer(user.address, COLLECTABLE_2);
    await mockToken.connect(user).approve(Collection.address, COLLECTABLE_2);
    await mockToken_2.connect(user).approve(Collection.address, COLLECTABLE_2);
    await CollectionWithUser.buyCollectable(1, 1);
    await CollectionWithUser.buyCollectable(2, 1);
    const beforeBalance = await mockToken.balanceOf(ownerAddress);
    const beforeBalance_2 = await mockToken_2.balanceOf(ownerAddress);
    await Collection.withdrawAllERC20();
    expect(await mockToken.balanceOf(ownerAddress)).to.above(beforeBalance);
    expect(await mockToken_2.balanceOf(ownerAddress)).to.above(beforeBalance_2);
  });
  it("Collect native tokens", async function () {
    mockToken.transfer(user.address, COLLECTABLE_2);
    await mockToken.connect(user).approve(Collection.address, COLLECTABLE_2);
    await CollectionWithUser.buyCollectable(0, 1, {value: COLLECTABLE_1});
    const beforeBalance = await ethers.provider.getBalance(ownerAddress);
    await Collection.withdrawETH();
    expect(await ethers.provider.getBalance(ownerAddress)).to.be.above(beforeBalance);
  });
  it("Collect all tokens", async function () {
    mockToken.transfer(user.address, COLLECTABLE_2);
    await mockToken.connect(user).approve(Collection.address, COLLECTABLE_2);
    await CollectionWithUser.buyCollectable(0, 1, {value: COLLECTABLE_1});
    await CollectionWithUser.buyCollectable(1, 1);
    const beforeBalanceERC20 = await mockToken.balanceOf(ownerAddress);
    const beforeBalanceETH = await ethers.provider.getBalance(ownerAddress);
    await Collection.withdrawAllTokens();
    expect(await mockToken.balanceOf(ownerAddress)).to.be.above(beforeBalanceERC20);
    expect(await ethers.provider.getBalance(ownerAddress)).to.be.above(beforeBalanceETH);
  });
  it("Recover ERC1155", async function () {
    await expect(
      Collection.withdrawERC1155(1, 0, 1)
    ).to.be.reverted;
    await ethers.provider.send("evm_increaseTime", [lockPeriod])
    await ethers.provider.send("evm_mine")
    await Collection.withdrawERC1155(1, 0, 1);
    expect(await .balanceOf(ownerAddress, 1)).to.equal(2);
    expect(await .balanceOf(Collection.address, 1)).to.equal(1);
  });
  it("Recover all ERC1155", async function () {
    await Collection.withdrawAllERC1155(1);
    expect(await .balanceOf(ownerAddress, 1)).to.equal(3);
    expect(await .balanceOf(Collection.address, 1)).to.equal(0);
    expect(await .balanceOf(ownerAddress, 2)).to.equal(1);
    expect(await .balanceOf(Collection.address, 1)).to.equal(0);
  });
  it("Decrease avaliable after recovery", async function () {
    await .safeTransferFrom(ownerAddress, Collection.address, 1, 1, ethers.constants.AddressZero);
    await Collection.withdrawERC1155(1, 0, 2);
    expect(await .balanceOf(Collection.address, 1)).to.equal(1);
    expect(await .balanceOf(ownerAddress, 1)).to.equal(2);
    const roundCollection = await Collection.roundCollection(1, 0);
    expect(roundCollection[2]).to.equal(0);

    await Collection.sweepERC1155(1, 1);
    expect(await .balanceOf(Collection.address, 1)).to.equal(0);
    expect(await .balanceOf(ownerAddress, 1)).to.equal(3);
  });
});
