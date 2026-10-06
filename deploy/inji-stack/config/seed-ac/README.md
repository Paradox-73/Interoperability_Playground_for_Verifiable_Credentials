# certify-ac seed

The SD-JWT credential configuration of `../seed/` for certify-ac (holder-web profile), with certify-ac's
issuer DID (`did:web:certify-ac.ps02.test`). Added by the `certify-ac-seed` service of `compose.yaml`.

`farmer-mdoc.credential-configuration.json` adds `FarmerMdoc` (`mso_mdoc`); its template (`../seed/farmer-mdoc.template.json`,
base64 in `vcTemplate`) reads the farmer CSV columns. The core Certify gets the same configuration from `../seed/`.
