use anchor_lang::prelude::*;
use mpl_token_metadata::instructions::CreateV1Builder;
use mpl_token_metadata::accounts::Metadata;
use anchor_lang::solana_program::instruction::Instruction;

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
    Ok(CreateV1Builder::new()
        .metadata(metadata)
        .mint(mint, true)
        .authority(mint_authority)
        .payer(payer)
        .update_authority(update_authority, true)
        .name(name)
        .symbol(symbol)
        .uri(uri)
        .seller_fee_basis_points(0)
        .is_mutable(false)
        .instruction())
}

pub fn find_metadata_account(mint: &Pubkey) -> (Pubkey, u8) {
    Metadata::find_pda(mint)
}