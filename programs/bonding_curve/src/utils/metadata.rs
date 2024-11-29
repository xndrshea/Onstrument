use anchor_lang::prelude::*;
use mpl_token_metadata::instructions::{CreateMetadataAccountV3, CreateMetadataAccountV3InstructionArgs};
use mpl_token_metadata::types::DataV2;
use solana_program::instruction::Instruction;
use solana_program::{system_program, sysvar};
use crate::utils::error::ErrorCode;

pub fn find_metadata_account(mint: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            b"metadata",
            mpl_token_metadata::ID.as_ref(),
            mint.as_ref(),
        ],
        &mpl_token_metadata::ID,
    )
}

pub fn validate_metadata_account(
    metadata: &AccountInfo,
    metadata_program: &AccountInfo,
    system_program: &Program<System>,
    mint: &Pubkey,
) -> Result<()> {
    // Validate metadata account owner
    if metadata.owner != system_program.key {
        return Err(ErrorCode::InvalidOwner.into());
    }

    // Validate metadata program
    if metadata_program.key() != mpl_token_metadata::ID {
        return Err(ErrorCode::InvalidMetadataProgram.into());
    }

    // Validate metadata PDA
    let (expected_metadata, _) = find_metadata_account(mint);
    if metadata.key() != expected_metadata {
        return Err(ErrorCode::InvalidMetadataAddress.into());
    }

    Ok(())
}

pub fn create_metadata_ix(
    metadata: Pubkey,
    mint: Pubkey,
    mint_authority: Pubkey,
    payer: Pubkey,
    update_authority: Pubkey,
    name: String,
    symbol: String,
    uri: String,
) -> Result<Instruction> {
    let data_v2 = DataV2 {
        name,
        symbol,
        uri,
        seller_fee_basis_points: 0,
        creators: None,
        collection: None,
        uses: None,
    };

    Ok(CreateMetadataAccountV3 {
        metadata,
        mint,
        mint_authority,
        payer,
        update_authority: (update_authority, true),
        system_program: system_program::ID,
        rent: Some(sysvar::rent::ID),
    }.instruction(CreateMetadataAccountV3InstructionArgs {
        data: data_v2,
        is_mutable: false,
        collection_details: None,
    }))
}