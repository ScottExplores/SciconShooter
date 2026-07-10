// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract SciconRecords is ERC721URIStorage, EIP712, Ownable {
    bytes32 private constant MISSION_TYPEHASH = keccak256(
        "MissionAuthorization(bytes32 runId,address player,uint256 score,uint256 wave,uint256 visualSeed,bytes32 tokenUriHash,uint256 expiresAt)"
    );
    bytes32 private constant CHAMPION_TYPEHASH = keccak256(
        "ChampionAuthorization(bytes32 runId,bytes32 weekKey,address player,uint256 score,bytes32 proposalIdHash,uint256 allocationRsc,bytes32 allocationTxHash,bytes32 tokenUriHash,uint256 expiresAt)"
    );

    address public authorizer;
    uint256 private nextTokenId = 1;
    mapping(bytes32 => bool) public missionRunMinted;
    mapping(bytes32 => bool) public championWeekMinted;

    event AuthorizerUpdated(address indexed previousAuthorizer, address indexed newAuthorizer);
    event MissionRecordMinted(uint256 indexed tokenId, bytes32 indexed runId, address indexed player, uint256 score, uint256 wave);
    event ChampionRecordMinted(uint256 indexed tokenId, bytes32 indexed weekKey, bytes32 indexed runId, address player, uint256 score, uint256 allocationRsc, bytes32 allocationTxHash);

    error AuthorizationExpired();
    error InvalidAuthorization();
    error RecordAlreadyMinted();
    error ZeroAddress();

    constructor(address initialOwner, address initialAuthorizer)
        ERC721("Scicon Shooter Records", "SCICON")
        EIP712("Scicon Shooter Records", "1")
        Ownable(initialOwner)
    {
        if (initialAuthorizer == address(0)) revert ZeroAddress();
        authorizer = initialAuthorizer;
    }

    function setAuthorizer(address newAuthorizer) external onlyOwner {
        if (newAuthorizer == address(0)) revert ZeroAddress();
        emit AuthorizerUpdated(authorizer, newAuthorizer);
        authorizer = newAuthorizer;
    }

    function mintMissionRecord(
        bytes32 runId,
        uint256 score,
        uint256 wave,
        uint256 visualSeed,
        string calldata tokenUri,
        uint256 expiresAt,
        bytes calldata signature
    ) external returns (uint256 tokenId) {
        if (block.timestamp > expiresAt) revert AuthorizationExpired();
        if (missionRunMinted[runId]) revert RecordAlreadyMinted();
        bytes32 structHash = keccak256(abi.encode(
            MISSION_TYPEHASH,
            runId,
            msg.sender,
            score,
            wave,
            visualSeed,
            keccak256(bytes(tokenUri)),
            expiresAt
        ));
        if (ECDSA.recover(_hashTypedDataV4(structHash), signature) != authorizer) revert InvalidAuthorization();

        missionRunMinted[runId] = true;
        tokenId = nextTokenId++;
        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, tokenUri);
        emit MissionRecordMinted(tokenId, runId, msg.sender, score, wave);
    }

    function mintChampionRecord(
        bytes32 runId,
        bytes32 weekKey,
        uint256 score,
        string calldata proposalId,
        uint256 allocationRsc,
        bytes32 allocationTxHash,
        string calldata tokenUri,
        uint256 expiresAt,
        bytes calldata signature
    ) external returns (uint256 tokenId) {
        if (block.timestamp > expiresAt) revert AuthorizationExpired();
        if (championWeekMinted[weekKey]) revert RecordAlreadyMinted();
        bytes32 structHash = keccak256(abi.encode(
            CHAMPION_TYPEHASH,
            runId,
            weekKey,
            msg.sender,
            score,
            keccak256(bytes(proposalId)),
            allocationRsc,
            allocationTxHash,
            keccak256(bytes(tokenUri)),
            expiresAt
        ));
        if (ECDSA.recover(_hashTypedDataV4(structHash), signature) != authorizer) revert InvalidAuthorization();

        championWeekMinted[weekKey] = true;
        tokenId = nextTokenId++;
        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, tokenUri);
        emit ChampionRecordMinted(tokenId, weekKey, runId, msg.sender, score, allocationRsc, allocationTxHash);
    }
}
