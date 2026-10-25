// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Team Badmosip
/**
 * Test identities the authorization server logs in without a login page.
 *
 * The default identity uses the `id` of the first row of the upstream Inji Certify farmer sample
 * (`deploy/inji-stack/config/farmer_identity_data.csv`, imported from inji-certify@e54539a), because
 * Certify's CSV data provider looks the holder up by the access token's `sub`. Name, birth date and
 * gender are copied from that row; the e-mail address and picture are invented (Mimoto's token login needs
 * an `email` claim, `GoogleTokenService.java:64-67`, and a `picture` on later sign-ins) under the reserved
 * `.test` domain.
 */
export interface TestIdentity {
  /** Subject identifier put into access and ID tokens. */
  sub: string;
  /** OpenID Connect standard claims (Core section 5.1) for the ID token and the userinfo endpoint. */
  claims: Record<string, unknown>;
}

export const FARMER_TEST_IDENTITY: TestIdentity = {
  sub: '2154189532',
  claims: {
    name: 'Gorge Cooper',
    given_name: 'Gorge',
    family_name: 'Cooper',
    birthdate: '1990-05-25',
    gender: 'Male',
    email: 'farmer-2154189532@playground.ps02.test',
    email_verified: true,
    // Optional in OpenID Connect, but Mimoto 0.22.0 stores it and fails on the next sign-in when it was
    // missing (NullPointerException in UserMetadataService.updateIfChanged, gap G21).
    picture: 'https://playground.ps02.test/avatar.png',
    phone_number: '+919876543210',
  },
};
