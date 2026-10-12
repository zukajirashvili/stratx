/**
 * Integration tests for the StratX offer auction (USDC escrow).
 *
 * Run with `anchor test` (inside WSL/Linux/macOS) after `anchor build`.
 * Uses solana-bankrun so the cluster clock can be set to exact timestamps,
 * and injects a 6-decimal test USDC mint plus funded token accounts directly.
 *
 * bankrun loads the program without an upgradeable ProgramData account, so
 * `initialize_config` is tested only for rejection; Config is injected for the
 * other tests. The happy-path init runs on Devnet via scripts/init-config.ts.
 */
import * as anchor from '@coral-xyz/anchor'
import { BN, Program } from '@coral-xyz/anchor'
import {
  ACCOUNT_SIZE,
  AccountLayout,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  MINT_SIZE,
  MintLayout,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from '@solana/web3.js'
import { BankrunProvider, startAnchor } from 'anchor-bankrun'
import { expect } from 'chai'
import { Clock, ProgramTestContext } from 'solana-bankrun'
import type { StratxAuction } from '../target/types/stratx_auction'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const IDL = require('../target/idl/stratx_auction.json')

const USDC = 1_000_000n
const T0 = 1_800_000_000n

const bytes = (s: string, n: number) => {
  const out = new Array(n).fill(0)
  Buffer.from(s, 'utf8').forEach((b, i) => (out[i] = b))
  return out
}

describe('stratx_auction (offer model)', () => {
  let context: ProgramTestContext
  let program: Program<StratxAuction>
  const mint = Keypair.generate().publicKey
  const admin = Keypair.generate()
  const feeRecipient = Keypair.generate()
  const seller = Keypair.generate()
  const alice = Keypair.generate()
  const bob = Keypair.generate()
  const carol = Keypair.generate()
  let configPda: PublicKey
  let nextId = 1

  const ata = (owner: PublicKey) => getAssociatedTokenAddressSync(mint, owner, true)
  const pda = (seeds: Buffer[]) => PublicKey.findProgramAddressSync(seeds, program.programId)[0]
  const listingPda = (s: PublicKey, id: number) => pda([Buffer.from('listing'), s.toBuffer(), new BN(id).toArrayLike(Buffer, 'le', 8)])
  const offerPda = (listing: PublicKey, bidder: PublicKey) => pda([Buffer.from('offer'), listing.toBuffer(), bidder.toBuffer()])
  const entitlementPda = (listing: PublicKey) => pda([Buffer.from('entitlement'), listing.toBuffer()])

  async function setTime(unix: bigint) {
    const c = await context.banksClient.getClock()
    context.setClock(new Clock(c.slot + 1n, c.epochStartTimestamp, c.epoch, c.leaderScheduleEpoch, unix))
  }

  async function usdc(owner: PublicKey): Promise<bigint> {
    const acc = await context.banksClient.getAccount(ata(owner))
    return acc ? AccountLayout.decode(Buffer.from(acc.data)).amount : 0n
  }

  function setTokenAccount(owner: PublicKey, amount: bigint) {
    const data = Buffer.alloc(ACCOUNT_SIZE)
    AccountLayout.encode(
      {
        mint,
        owner,
        amount,
        delegateOption: 0,
        delegate: PublicKey.default,
        state: 1,
        isNativeOption: 0,
        isNative: 0n,
        delegatedAmount: 0n,
        closeAuthorityOption: 0,
        closeAuthority: PublicKey.default,
      },
      data,
    )
    context.setAccount(ata(owner), { lamports: Number(LAMPORTS_PER_SOL / 100), data, owner: TOKEN_PROGRAM_ID, executable: false })
  }

  async function createListing(o: Partial<{ ask: bigint; min: bigint; end: bigint; days: number }> = {}) {
    const id = nextId++
    const listing = listingPda(seller.publicKey, id)
    await program.methods
      .createListing(
        new BN(id),
        bytes('basalt-basis-carry', 32),
        bytes('Basalt Basis Carry', 64),
        new BN((o.ask ?? 15_000n * USDC).toString()),
        new BN((o.min ?? 10_000n * USDC).toString()),
        new BN((o.end ?? T0 + 3_600n).toString()),
        o.days ?? 30,
      )
      .accounts({ seller: seller.publicKey })
      .signers([seller])
      .rpc()
    return listing
  }

  async function placeOffer(listing: PublicKey, who: Keypair, amount: bigint, expiresAt = 0n) {
    const offer = offerPda(listing, who.publicKey)
    await program.methods
      .placeOffer(new BN(amount.toString()), new BN(expiresAt.toString()))
      .accountsPartial({
        listing,
        offer,
        vault: ata(offer),
        config: configPda,
        usdcMint: mint,
        bidderToken: ata(who.publicKey),
        bidder: who.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([who])
      .rpc()
    return offer
  }

  async function accept(listing: PublicKey, bidder: PublicKey, expected: bigint, signer: Keypair = seller, overrides: Record<string, PublicKey> = {}) {
    const offer = offerPda(listing, bidder)
    return program.methods
      .acceptOffer(new BN(expected.toString()))
      .accountsPartial({
        listing,
        offer,
        vault: ata(offer),
        entitlement: entitlementPda(listing),
        config: configPda,
        usdcMint: mint,
        seller: signer.publicKey,
        sellerToken: ata(signer.publicKey),
        feeRecipient: feeRecipient.publicKey,
        feeRecipientToken: ata(feeRecipient.publicKey),
        bidder,
        bidderToken: ata(bidder),
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        ...overrides,
      })
      .signers([signer])
      .rpc()
  }

  async function withdraw(listing: PublicKey, bidder: PublicKey, actor: Keypair) {
    const offer = offerPda(listing, bidder)
    return program.methods
      .withdrawOffer()
      .accountsPartial({
        listing,
        offer,
        vault: ata(offer),
        config: configPda,
        usdcMint: mint,
        bidder,
        bidderToken: ata(bidder),
        actor: actor.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([actor])
      .rpc()
  }

  async function expectError(p: Promise<unknown>, name?: string) {
    try {
      await p
    } catch (e) {
      if (name) expect(String(e)).to.include(name)
      return
    }
    expect.fail(`expected error ${name ?? ''}`)
  }

  before(async () => {
    const sol = (k: Keypair) => ({
      address: k.publicKey,
      info: { lamports: Number(100n * BigInt(LAMPORTS_PER_SOL)), data: Buffer.alloc(0), owner: SystemProgram.programId, executable: false },
    })
    context = await startAnchor('.', [], [sol(admin), sol(feeRecipient), sol(seller), sol(alice), sol(bob), sol(carol)])
    const provider = new BankrunProvider(context)
    anchor.setProvider(provider)
    program = new Program<StratxAuction>(IDL, provider)

    // 6-decimal test USDC mint.
    const mintData = Buffer.alloc(MINT_SIZE)
    MintLayout.encode(
      { mintAuthorityOption: 1, mintAuthority: admin.publicKey, supply: 10n ** 15n, decimals: 6, isInitialized: true, freezeAuthorityOption: 0, freezeAuthority: PublicKey.default },
      mintData,
    )
    context.setAccount(mint, { lamports: Number(LAMPORTS_PER_SOL), data: mintData, owner: TOKEN_PROGRAM_ID, executable: false })
    for (const k of [alice, bob, carol]) setTokenAccount(k.publicKey, 100_000n * USDC)
    for (const k of [seller, feeRecipient]) setTokenAccount(k.publicKey, 0n)

    // Inject Config: discriminator + admin + fee_recipient + usdc_mint + bump.
    const [cfg, bump] = PublicKey.findProgramAddressSync([Buffer.from('config')], program.programId)
    configPda = cfg
    const disc = IDL.accounts.find((a: { name: string }) => a.name === 'Config').discriminator
    const data = Buffer.concat([Buffer.from(disc), admin.publicKey.toBuffer(), feeRecipient.publicKey.toBuffer(), mint.toBuffer(), Buffer.from([bump])])
    context.setAccount(configPda, { lamports: Number(LAMPORTS_PER_SOL), data, owner: program.programId, executable: false })
    await setTime(T0)
  })

  describe('config', () => {
    it('rejects initialize_config from a non-upgrade-authority', async () => {
      const [programData] = PublicKey.findProgramAddressSync([program.programId.toBuffer()], new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111'))
      await expectError(
        program.methods
          .initializeConfig()
          .accountsPartial({ config: configPda, admin: alice.publicKey, feeRecipient: alice.publicKey, usdcMint: mint, program: program.programId, programData })
          .signers([alice])
          .rpc(),
      )
    })
    it('rejects fee-recipient changes by non-admins', async () => {
      await expectError(
        program.methods.updateFeeRecipient().accounts({ admin: alice.publicKey, newFeeRecipient: alice.publicKey }).signers([alice]).rpc(),
        'Unauthorized',
      )
    })
  })

  describe('create_listing validation', () => {
    it('rejects a minimum offer above the asking price', async () => {
      await expectError(createListing({ ask: 100n * USDC, min: 101n * USDC }), 'MinOfferAboveAsk')
    })
    it('rejects amounts below 1 USDC', async () => {
      await expectError(createListing({ ask: USDC - 1n, min: USDC - 1n }), 'AmountOutOfRange')
    })
    it('rejects too-short or past windows', async () => {
      await expectError(createListing({ end: T0 + 60n }), 'ListingWindowOutOfRange')
      await expectError(createListing({ end: T0 - 1n }), 'ListingWindowOutOfRange')
    })
    it('rejects invalid access terms', async () => {
      await expectError(createListing({ days: 0 }), 'AccessTermOutOfRange')
    })
  })

  describe('offers, acceptance and payment', () => {
    it('escrows offers, lets the seller pick one, and pays exactly 3% / 97%', async () => {
      await setTime(T0)
      const listing = await createListing() // ask 15,000 USDC, min 10,000
      const aliceBefore = await usdc(alice.publicKey)
      await placeOffer(listing, alice, 12_000n * USDC)
      expect(aliceBefore - (await usdc(alice.publicKey))).to.equal(12_000n * USDC) // escrowed
      await setTime(T0 + 900n) // 15 minutes later
      await placeOffer(listing, bob, 14_000n * USDC)

      const [feeBefore, sellerBefore] = [await usdc(feeRecipient.publicKey), await usdc(seller.publicKey)]
      await accept(listing, bob.publicKey, 14_000n * USDC)
      expect((await usdc(feeRecipient.publicKey)) - feeBefore).to.equal(420n * USDC) // 3%
      expect((await usdc(seller.publicKey)) - sellerBefore).to.equal(13_580n * USDC) // 97%

      const l = await program.account.listing.fetch(listing)
      expect(l.status).to.deep.equal({ sold: {} })
      expect(l.buyer.toBase58()).to.equal(bob.publicKey.toBase58())
      expect(l.salePrice.toString()).to.equal((14_000n * USDC).toString())
      const e = await program.account.entitlement.fetch(entitlementPda(listing))
      expect(e.protocolFee.toString()).to.equal((420n * USDC).toString())
      expect(e.sellerProceeds.toString()).to.equal((13_580n * USDC).toString())
      expect(await context.banksClient.getAccount(offerPda(listing, bob.publicKey))).to.equal(null) // closed
      expect(await context.banksClient.getAccount(ata(offerPda(listing, bob.publicKey)))).to.equal(null) // vault closed

      // Alice's losing offer: anyone can now refund it — to Alice.
      const aliceMid = await usdc(alice.publicKey)
      await withdraw(listing, alice.publicKey, carol)
      expect((await usdc(alice.publicKey)) - aliceMid).to.equal(12_000n * USDC)
    })

    it('splits odd amounts with the fee rounded down', async () => {
      await setTime(T0)
      const listing = await createListing({ ask: 2_000_000n, min: 1_000_000n })
      await placeOffer(listing, alice, 1_000_033n)
      const [f0, s0] = [await usdc(feeRecipient.publicKey), await usdc(seller.publicKey)]
      await accept(listing, alice.publicKey, 1_000_033n)
      const fee = (await usdc(feeRecipient.publicKey)) - f0
      const proceeds = (await usdc(seller.publicKey)) - s0
      expect(fee).to.equal(30_000n)
      expect(proceeds).to.equal(970_033n)
      expect(fee + proceeds).to.equal(1_000_033n)
    })

    it('allows only one accepted offer per listing', async () => {
      await setTime(T0)
      const listing = await createListing()
      await placeOffer(listing, alice, 11_000n * USDC)
      await placeOffer(listing, bob, 12_000n * USDC)
      await accept(listing, alice.publicKey, 11_000n * USDC)
      await expectError(accept(listing, bob.publicKey, 12_000n * USDC)) // ListingNotOpen / entitlement exists
      const l = await program.account.listing.fetch(listing)
      expect(l.buyer.toBase58()).to.equal(alice.publicKey.toBase58())
    })

    it('rejects offers below the minimum, by the seller, after the end, and duplicates', async () => {
      await setTime(T0)
      const listing = await createListing()
      setTokenAccount(seller.publicKey, 50_000n * USDC)
      await expectError(placeOffer(listing, alice, 9_999n * USDC), 'OfferBelowMinimum')
      await expectError(placeOffer(listing, seller, 12_000n * USDC), 'SellerCannotBid')
      await placeOffer(listing, alice, 10_000n * USDC)
      await expectError(placeOffer(listing, alice, 10_500n * USDC)) // one live offer per bidder (PDA exists)
      await setTime(T0 + 3_600n)
      await expectError(placeOffer(listing, bob, 12_000n * USDC), 'ListingEnded')
      setTokenAccount(seller.publicKey, 0n)
    })

    it('rejects accepting after the end, an expired offer, or a changed amount', async () => {
      await setTime(T0)
      const listing = await createListing()
      await placeOffer(listing, alice, 12_000n * USDC, T0 + 600n)
      await placeOffer(listing, bob, 13_000n * USDC)
      await expectError(accept(listing, bob.publicKey, 13_500n * USDC), 'OfferAmountMismatch')
      await setTime(T0 + 600n)
      await expectError(accept(listing, alice.publicKey, 12_000n * USDC), 'OfferExpired')
      await setTime(T0 + 3_600n)
      await expectError(accept(listing, bob.publicKey, 13_000n * USDC), 'OfferExpired')
    })

    it('a failed acceptance leaves the listing open and funds in escrow', async () => {
      await setTime(T0)
      const listing = await createListing()
      await placeOffer(listing, alice, 12_000n * USDC)
      const s0 = await usdc(seller.publicKey)
      await expectError(accept(listing, alice.publicKey, 11_000n * USDC), 'OfferAmountMismatch')
      const l = await program.account.listing.fetch(listing)
      expect(l.status).to.deep.equal({ open: {} })
      expect(await usdc(seller.publicKey)).to.equal(s0)
      expect(await usdc(offerPda(listing, alice.publicKey))).to.equal(12_000n * USDC)
      expect(await context.banksClient.getAccount(entitlementPda(listing))).to.equal(null)
    })

    it('rejects a redirected fee recipient or acceptance by a non-seller', async () => {
      await setTime(T0)
      const listing = await createListing()
      await placeOffer(listing, alice, 12_000n * USDC)
      await expectError(
        accept(listing, alice.publicKey, 12_000n * USDC, seller, { feeRecipient: carol.publicKey, feeRecipientToken: ata(carol.publicKey) }),
        'InvalidFeeRecipient',
      )
      setTokenAccount(carol.publicKey, 100_000n * USDC)
      await expectError(accept(listing, alice.publicKey, 12_000n * USDC, carol), 'Unauthorized')
    })
  })

  describe('withdrawals and listing lifecycle', () => {
    it('only the bidder can withdraw a live offer', async () => {
      await setTime(T0)
      const listing = await createListing()
      await placeOffer(listing, alice, 12_000n * USDC)
      await expectError(withdraw(listing, alice.publicKey, bob), 'NotAllowedToWithdraw')
      const before = await usdc(alice.publicKey)
      await withdraw(listing, alice.publicKey, alice)
      expect((await usdc(alice.publicKey)) - before).to.equal(12_000n * USDC)
      expect((await program.account.listing.fetch(listing)).offerCount).to.equal(0)
    })

    it('anyone can refund once the listing has ended', async () => {
      await setTime(T0)
      const listing = await createListing()
      await placeOffer(listing, alice, 12_000n * USDC)
      await setTime(T0 + 3_600n)
      const before = await usdc(alice.publicKey)
      await withdraw(listing, alice.publicKey, carol)
      expect((await usdc(alice.publicKey)) - before).to.equal(12_000n * USDC)
      await program.methods.closeExpired().accounts({ listing }).rpc()
      expect((await program.account.listing.fetch(listing)).status).to.deep.equal({ expired: {} })
    })

    it('only the seller can cancel; cancelled listings refuse offers and allow refunds', async () => {
      await setTime(T0)
      const listing = await createListing()
      await placeOffer(listing, alice, 12_000n * USDC)
      await expectError(program.methods.cancelListing().accounts({ listing, seller: bob.publicKey }).signers([bob]).rpc())
      await program.methods.cancelListing().accounts({ listing, seller: seller.publicKey }).signers([seller]).rpc()
      await expectError(placeOffer(listing, bob, 12_000n * USDC), 'ListingNotOpen')
      await withdraw(listing, alice.publicKey, carol)
    })

    it('rejects recording expiry before the end', async () => {
      await setTime(T0)
      const listing = await createListing()
      await expectError(program.methods.closeExpired().accounts({ listing }).rpc(), 'ListingNotEnded')
    })
  })

  describe('truth bonds', () => {
    const charityA = Keypair.generate()
    const charityB = Keypair.generate()
    const charitiesPda = () => pda([Buffer.from('charities')])
    const bondPda = (quant: PublicKey, strategy: string) => pda([Buffer.from('bond'), quant.toBuffer(), Buffer.from(bytes(strategy, 32))])

    const setCharities = (signer: Keypair, wallets: PublicKey[], names: string[]) =>
      program.methods
        .setCharities(wallets, names.map((n) => bytes(n, 32)))
        .accountsPartial({ config: configPda, charities: charitiesPda(), admin: signer.publicKey, systemProgram: SystemProgram.programId })
        .signers([signer])
        .rpc()

    const postBond = (quant: Keypair, strategy: string, amount: bigint, days: number, charityIndex: number) => {
      const bond = bondPda(quant.publicKey, strategy)
      return program.methods
        .postBond(bytes(strategy, 32), new BN(amount.toString()), days, charityIndex)
        .accountsPartial({
          bond,
          vault: ata(bond),
          config: configPda,
          charities: charitiesPda(),
          usdcMint: mint,
          quantToken: ata(quant.publicKey),
          quant: quant.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([quant])
        .rpc()
    }

    const releaseBond = (quant: Keypair, strategy: string) => {
      const bond = bondPda(quant.publicKey, strategy)
      return program.methods
        .releaseBond()
        .accountsPartial({ bond, vault: ata(bond), config: configPda, usdcMint: mint, quant: quant.publicKey, quantToken: ata(quant.publicKey), tokenProgram: TOKEN_PROGRAM_ID })
        .signers([quant])
        .rpc()
    }

    const slashBond = (signer: Keypair, quant: PublicKey, strategy: string, charity: PublicKey) => {
      const bond = bondPda(quant, strategy)
      return program.methods
        .slashBond()
        .accountsPartial({
          bond,
          vault: ata(bond),
          config: configPda,
          admin: signer.publicKey,
          usdcMint: mint,
          charity,
          charityToken: ata(charity),
          quant,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([signer])
        .rpc()
    }

    before(async () => {
      await setTime(T0)
      setTokenAccount(seller.publicKey, 1_000n * USDC)
      for (const c of [charityA, charityB]) setTokenAccount(c.publicKey, 0n)
    })

    it('only the admin can set the charity list, and it must be valid', async () => {
      await expectError(setCharities(alice, [charityA.publicKey], ['Education fund']), 'Unauthorized')
      await expectError(setCharities(admin, [charityA.publicKey], []), 'InvalidCharityList')
      await setCharities(admin, [charityA.publicKey, charityB.publicKey], ['Education fund', 'Health fund'])
      const list = await program.account.charityList.fetch(charitiesPda())
      expect(list.count).to.equal(2)
      expect(list.wallets[1].toBase58()).to.equal(charityB.publicKey.toBase58())
    })

    it('locks the bond in escrow with the chosen charity', async () => {
      const before = await usdc(seller.publicKey)
      await postBond(seller, 'bond-locks', 100n * USDC, 90, 1)
      expect(before - (await usdc(seller.publicKey))).to.equal(100n * USDC)
      const bond = await program.account.bond.fetch(bondPda(seller.publicKey, 'bond-locks'))
      expect(bond.status).to.deep.equal({ active: {} })
      expect(bond.charity.toBase58()).to.equal(charityB.publicKey.toBase58())
      expect(bond.unlockAt.toString()).to.equal((T0 + 90n * 86_400n).toString())
      expect(await usdc(bondPda(seller.publicKey, 'bond-locks'))).to.equal(100n * USDC)
    })

    it('rejects an unknown charity, bad amounts or lock periods, and a second bond on the same strategy', async () => {
      await expectError(postBond(seller, 'bond-bad', 100n * USDC, 90, 5), 'InvalidCharity')
      await expectError(postBond(seller, 'bond-bad', USDC - 1n, 90, 0), 'AmountOutOfRange')
      await expectError(postBond(seller, 'bond-bad', 100n * USDC, 0, 0), 'BondTermOutOfRange')
      await expectError(postBond(seller, 'bond-locks', 100n * USDC, 90, 0)) // bond PDA already exists
    })

    it('the quant can only take the bond back after the lock period', async () => {
      await setTime(T0)
      await postBond(seller, 'bond-release', 50n * USDC, 1, 0)
      await expectError(releaseBond(seller, 'bond-release'), 'BondLocked')
      await setTime(T0 + 86_400n)
      const before = await usdc(seller.publicKey)
      await releaseBond(seller, 'bond-release')
      expect((await usdc(seller.publicKey)) - before).to.equal(50n * USDC)
      expect((await program.account.bond.fetch(bondPda(seller.publicKey, 'bond-release'))).status).to.deep.equal({ released: {} })
      await expectError(releaseBond(seller, 'bond-release'))
      await setTime(T0)
    })

    it('only the admin can slash, and the whole bond goes to the chosen charity', async () => {
      await postBond(seller, 'bond-slash', 80n * USDC, 30, 0)
      await expectError(slashBond(alice, seller.publicKey, 'bond-slash', charityA.publicKey), 'Unauthorized')
      await expectError(slashBond(admin, seller.publicKey, 'bond-slash', charityB.publicKey), 'InvalidCharity')
      const before = await usdc(charityA.publicKey)
      await slashBond(admin, seller.publicKey, 'bond-slash', charityA.publicKey)
      expect((await usdc(charityA.publicKey)) - before).to.equal(80n * USDC)
      expect((await program.account.bond.fetch(bondPda(seller.publicKey, 'bond-slash'))).status).to.deep.equal({ slashed: {} })
      await expectError(slashBond(admin, seller.publicKey, 'bond-slash', charityA.publicKey))
      await setTime(T0 + 30n * 86_400n)
      await expectError(releaseBond(seller, 'bond-slash'))
      await setTime(T0)
    })
  })
})
