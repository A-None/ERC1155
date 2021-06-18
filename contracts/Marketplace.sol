//SPDX-License-Identifier: Unlicense
pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

contract Marketplace is Ownable {
  using SafeMath for uint256;
  using Counters for Counters.Counter;
  Counters.Counter private _saleIds;

  struct AuctionSignature {
    uint256 auctionId;
    uint256[] tokenIds;
    uint256[] amounts;
    address bidder;
    uint256 price;
    address token;
    uint256 nonce;
  }

  struct Sale {
    address payable seller;
    uint256[] tokenIds;
    uint256[] amounts;
    uint256 price;
  }

  uint256 public constant PRECISION = 10000;
  // Comission fee used to calculate amount to give to use e.g 500 for 5%
  uint256 public commissionFee;
  // Address that collects the commissions
  address payable commissionWallet;
  IERC1155 ;

  // saleId => price of the token set by seller
  mapping(uint256 => Sale) public sales;

  string public constant name = "Marketplace";

  bytes32 public constant DOMAIN_TYPEHASH = keccak256(abi.encodePacked("EIP712Domain(string name,uint256 chainId,address verifyingContract)"));
  // The winning bidder allows seller to transfer amount
  bytes32 public constant BID_TYPEHASH = keccak256(abi.encodePacked("Bid(uint256 auctionId,uint256[] tokenIds,uint256[] amounts,address bidder,uint256 price,address token,uint256 nonce)"));

  // The mapping of supported ERC20 token addresses
  mapping(address => bool) supportedTokens;

  // auctionId => nonce, used to prevent replay attacks
  mapping (uint256 => uint256) public nonces;

  event ListSale(uint256 saleId, uint256[] tokenIds, uint256[] amount, address seller, uint256 price, uint256 timestamp);
  event CancelSale(uint256 saleId, address seller);
  event CompleteSale(uint256 saleId, uint256[] tokenIds, uint256[] amounts, address buyer, uint256 buyTimestamp, uint256 paymentAmount);
  event AuctionClaimed(uint256 auctionId, address indexed seller, address indexed bidder, uint256[] tokenIds, uint256[] amounts, uint256 price, uint256 timestamp);

  constructor(address _commissionWallet, uint256 _commissionFee, address[] memory _supportTokens, address _) public {
    commissionWallet = payable(_commissionWallet);
    commissionFee = _commissionFee;
     = IERC1155(_);
    for (uint256 i = 0; i < _supportTokens.length; i++) {
      supportedTokens[_supportTokens[i]] = true;
    }
  }

  /********************** SALE ********************************/

  // List new sale of NFT
  function listNewSale(uint256[] memory _tokenIds, uint256[] memory _amounts, uint256 _price) public {
    require(_price > 0, "MarketPlace: Price must be above 0");
    require(_tokenIds.length == _amounts.length, "MarketPlace: ids and amounts length mismatch");
    for (uint256 i = 0; i < _tokenIds.length; i++) {
      require(.balanceOf(msg.sender, _tokenIds[i]) >= _amounts[i], "MarketPlace: Caller does not own enough tokens");
    }
    _saleIds.increment();
    uint256 saleId = _saleIds.current();
    sales[saleId] = Sale(msg.sender, _tokenIds, _amounts, _price);
    
    emit ListSale(saleId, _tokenIds, _amounts, msg.sender, _price, block.timestamp); 
  }

  // Cancel sale of NFT
  function cancelSale(uint256 _saleId) public {
    require(sales[_saleId].seller != address(0), "MarketPlace: This sale doesn't exist");
    require(sales[_saleId].seller == msg.sender, "MarketPlace: Caller is not the owner of this sale");
    delete sales[_saleId];

    emit CancelSale(_saleId, msg.sender); 
  }

  // Buy NFT
  function buyFromSale(uint256 _saleId) public payable {
    Sale memory sale = sales[_saleId];
    require(sale.seller != address(0), "MarketPlace: This sale doesn't exist");
    require(msg.value >= sale.price, "MarketPlace: Payable value too low");

    //  takes commission for every sale
    uint256 commissionAmount = msg.value.mul(commissionFee).div(PRECISION);
    // Transfer seller the price - commission fee 
    sale.seller.transfer(msg.value.sub(commissionAmount));
    // Transfer commission wallet the commission fee
    commissionWallet.transfer(commissionAmount);
  
    // Give buyer ERC1155
    .safeBatchTransferFrom(sale.seller, msg.sender, sale.tokenIds, sale.amounts, "");
    emit CompleteSale(_saleId, sale.tokenIds, sale.amounts, msg.sender, block.timestamp, msg.value);
    delete sale;
  }

  /********************** AUCTION ********************************/

  // Function to check if bidder still has the amount they've bid with
  function getBidderMatchAmount(address _account, address _token, uint256 _amount) public view returns (bool enoughTokens) {
    enoughTokens = supportedTokens[_token] && IERC20(_token).balanceOf(_account) >= _amount;
  }

  function sellerClaimBySig(AuctionSignature memory auctionSignature,
  uint8 v, bytes32 r, bytes32 s) public {
    require(getBidderMatchAmount(auctionSignature.bidder, auctionSignature.token, auctionSignature.price), "MarketPlace: Token currently not supported or bidder does not have enough tokens");
    // Check if seller owns the tokens
    for (uint256 i = 0; i < auctionSignature.tokenIds.length; i++) {
      require(.balanceOf(msg.sender, auctionSignature.tokenIds[i]) >= auctionSignature.amounts[i], "MarketPlace: Caller does not own the auction tokens");
    }
    // Check if signature is valid
    bytes32 domainSeparator = keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256(bytes(name)), getChainId(), address(this)));
    bytes32 structHash = keccak256(abi.encode(BID_TYPEHASH, auctionSignature.auctionId, keccak256(abi.encodePacked(auctionSignature.tokenIds)), keccak256(abi.encodePacked(auctionSignature.amounts)), auctionSignature.bidder, auctionSignature.price, auctionSignature.token, auctionSignature.nonce));
    bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    address signatory = ecrecover(digest, v, r, s);
    // Make sure the signature is from the bidder, who allows the seller to claim price
    require(signatory == auctionSignature.bidder, "MarketPlace: Invalid signature");
    // The seller is responsible for transfering their NFT to bidder and receiving the token
    _sellClaim(auctionSignature);
  }

  function getChainId() internal pure returns (uint256) {
    uint256 chainId;
    assembly { chainId := chainid() }
    return chainId;
  }

  function _sellClaim(AuctionSignature memory auctionSignature) internal {
    require(auctionSignature.nonce == nonces[auctionSignature.auctionId]++, "MarketPlace: Invalid nonce");
    IERC20 token = IERC20(auctionSignature.token);
    uint256 commissionAmount = auctionSignature.price.mul(commissionFee).div(PRECISION);
    // Transfer token to seller
    token.transferFrom(auctionSignature.bidder, address(msg.sender), auctionSignature.price.sub(commissionAmount));
    // Transfer token to commission wallet
    token.transferFrom(auctionSignature.bidder, commissionWallet, commissionAmount);
    .safeBatchTransferFrom(address(msg.sender), auctionSignature.bidder, auctionSignature.tokenIds, auctionSignature.amounts, "");
    emit AuctionClaimed(auctionSignature.auctionId, msg.sender, auctionSignature.bidder, auctionSignature.tokenIds, auctionSignature.amounts, auctionSignature.price, block.timestamp);
  }

  /********************** OWNER ********************************/

  function setCommissionFee(uint256 _commissionFee) public onlyOwner {
    commissionFee = _commissionFee;
  }

  function setCommissionWallet(address payable _commissionWallet) public onlyOwner {
    commissionWallet = _commissionWallet;
  }

  function setSupportedTokens(address[] memory _supportTokens) public onlyOwner {
    for (uint256 i = 0; i < _supportTokens.length; i++) {
      supportedTokens[_supportTokens[i]] = true;
    }
  }
}
