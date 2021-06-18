//SPDX-License-Identifier: Unlicense
pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./ERC20.sol";
import "./ERC1155.sol";
import "hardhat/console.sol";

contract Lootbox is Ownable {
    struct LootboxRates {
        uint256 lowerBound;
        uint256 upperBound;
    }

    struct Lootbox {
        uint256 tokenId;
        string name;
        string description;
        string mediaUri;
    }

    Lootbox[] public lootboxTokens;
    // If the randomly generated number is within a certain bound, then mint the lootbox token
    // e.g [struct(1, 10), struct(11, 100)], there is a 10% chance of minting the first item in the lootBoxToken array, and a 90% chance of minting the other
    // Make sure each item after and item has a lower bound of +1 of the previous upper bound
    LootboxRates[] public lootboxRates;

    ERC20 public Token;
    ERC1155 public ERC1155;

    constructor(address _Token, address _ERC1155)
        public
    {
        Token = ERC20(_Token);
        ERC1155 = ERC1155(_ERC1155);
    }

    // Internal function to pick a random number for opening lootbox
    function random() internal view returns(uint256) {
        uint256 _randomNumber;
        // The highest random number generated is the upper bound of the last element in the array
        uint256 _maxNumber = lootboxRates[lootboxRates.length - 1].upperBound;
        bytes32 _structHash;
        bytes32 _blockhash = blockhash(block.number-1);
        // waste some gas fee here
        for (uint i = 0; i < 10; i++) {
            getLootboxTokenId(0);
        }
        uint256 _gasleft = gasleft();

        _structHash = keccak256(
            abi.encode(
                _blockhash,
                _gasleft,
                block.timestamp
            )
        );
        _randomNumber  = uint256(_structHash);
        assembly {_randomNumber := add(mod(_randomNumber, _maxNumber),1)}
        return uint256(_randomNumber);
    }

    function getLootboxTokenId(uint256 _index) public view returns(uint256) {
        require (_index < lootboxTokens.length, 'Invalid Index');
        require (_index >= 0, 'Invalid Index');
        return lootboxTokens[_index].tokenId;
    }

    function openLootbox() public {
        // Must have at least one  token to open lootbox
        require(Token.balanceOf(msg.sender) >= 1, 'ERC1155: Insufficient  Tokens to open lootbox');
        uint256 randomNumber = random();
        uint256 index;
        // Loop through lootbox rates to see which index in the lootbox that's been opened
        for (uint256 i = 0; i < lootboxRates.length; i++) {
            if (lootboxRates[i].lowerBound <= randomNumber && lootboxRates[i].upperBound >= randomNumber) {
                index = i;
                break;
            }
        }
        // Burn the token
        Token.burn(msg.sender, 1 ether);
        Lootbox memory lootbox = lootboxTokens[index];
        // Mint lootbox token
        ERC1155.mintLootboxToken(msg.sender, 1, lootbox.tokenId, lootbox.name, lootbox.description, lootbox.mediaUri);
    }

    function addToLootbox(
    string[] memory names, 
    string[] memory descriptions, 
    string[] memory mediaUris,
    uint256[] memory lowerBounds, 
    uint256[] memory upperBounds) public onlyOwner {
        // Mint a list of tokens with their lower and upper bounds
        for (uint256 i = 0; i < names.length; i++) {
            string memory name = names[i];
            string memory description = descriptions[i];
            string memory mediaUri = mediaUris[i];
            uint256 lowerBound = lowerBounds[i];
            uint256 upperBound = upperBounds[i];
            uint256 tokenId = ERC1155.createLootboxToken(msg.sender, name, description, mediaUri);
            lootboxTokens.push(Lootbox(tokenId, name, description, mediaUri));
            lootboxRates.push(LootboxRates(lowerBound, upperBound));
        }
    }
}
