# 09. Links oficiais

## Hubs

- Marketing API: https://developers.facebook.com/docs/marketing-api/
- Graph API: https://developers.facebook.com/docs/graph-api
- Business Platform: https://developers.facebook.com/docs/business-platform
- Meta for Business (owner view): https://business.facebook.com/

## Seções da Marketing API

- Visão geral: https://developers.facebook.com/docs/marketing-api/overview
- Get Started: https://developers.facebook.com/docs/marketing-api/get-started
- Creative (hub): https://developers.facebook.com/docs/marketing-api/creative
- Advantage+ Creative: https://developers.facebook.com/docs/marketing-api/creative/advantage-creative/
- Asset Feed Spec: https://developers.facebook.com/docs/marketing-api/ad-creative/asset-feed-spec/
- Placement Asset Customization: https://developers.facebook.com/docs/marketing-api/dynamic-creative/placement-asset-customization/
- Cross-Channel Conversion Optimization: https://developers.facebook.com/docs/ccco
- Bidding: https://developers.facebook.com/docs/marketing-api/bidding
- Ad Rules: https://developers.facebook.com/docs/marketing-api/ad-rules
- Audiences: https://developers.facebook.com/docs/marketing-api/audiences
- Insights: https://developers.facebook.com/docs/marketing-api/insights
- Brand Safety and Suitability: https://developers.facebook.com/docs/marketing-api/brand-safety-and-suitability
- Best Practices: https://developers.facebook.com/docs/marketing-api/best-practices
- Troubleshooting: https://developers.facebook.com/docs/marketing-api/troubleshooting
- Error Codes Reference: https://developers.facebook.com/docs/marketing-api/error-reference/
- Reference: https://developers.facebook.com/docs/marketing-api/reference
- Changelog: https://developers.facebook.com/docs/marketing-api/marketing-api-changelog
- Out-of-cycle Changes: https://developers.facebook.com/docs/marketing-api/out-of-cycle-changes

## Referência de objetos (v25)

- Reference v25: https://developers.facebook.com/docs/marketing-api/reference/v25
- Ad Account: https://developers.facebook.com/docs/marketing-api/reference/ad-account
- Ad Account User: https://developers.facebook.com/docs/marketing-api/reference/ad-account-user
- Ad Campaign Group (Campaign): https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group
- Ad Group (Ad Set / Ad): https://developers.facebook.com/docs/marketing-api/reference/adgroup
- Ad Creative: https://developers.facebook.com/docs/marketing-api/reference/ad-creative
- Ad Asset Feed Spec Link URL: https://developers.facebook.com/docs/marketing-api/reference/ad-asset-feed-spec-link-url
- Ad Creative Degrees of Freedom Spec: https://developers.facebook.com/docs/marketing-api/reference/ad-creative-degrees-of-freedom-spec
- Ad Videos (edge): https://developers.facebook.com/docs/marketing-api/reference/ad-account/advideos/
- Ad Images (edge): https://developers.facebook.com/docs/marketing-api/reference/ad-account/adimages/
- Ads Insights: https://developers.facebook.com/docs/marketing-api/reference/ads-insights
- Ads Action Stats: https://developers.facebook.com/docs/marketing-api/reference/ads-action-stats
- Custom Audience: https://developers.facebook.com/docs/marketing-api/audiences/reference/custom-audience
- Lookalike Audience: https://developers.facebook.com/docs/marketing-api/audiences/reference/lookalike-audience
- Ad Rules Library: https://developers.facebook.com/docs/marketing-api/reference/ad-account/adrules_library

## Ferramentas

- Graph API Explorer: https://developers.facebook.com/tools/explorer/
- Access Token Debugger: https://developers.facebook.com/tools/debug/accesstoken/
- Sharing Debugger: https://developers.facebook.com/tools/debug/
- Webhooks Dashboard: https://developers.facebook.com/apps/  (em cada app)
- Business Settings: https://business.facebook.com/settings
- Events Manager (Pixel): https://business.facebook.com/events_manager2

## Permissões / políticas

- Permissions Reference: https://developers.facebook.com/docs/permissions/reference
- Platform Terms: https://developers.facebook.com/terms
- Advertising Standards: https://transparency.meta.com/policies/ad-standards/
- Commerce Policies: https://www.facebook.com/policies_center/commerce

## SDKs oficiais

- Business SDK (Python): https://github.com/facebook/facebook-python-business-sdk
- Business SDK (Node.js): https://github.com/facebook/facebook-nodejs-business-sdk
- Business SDK (PHP): https://github.com/facebook/facebook-php-business-sdk
- Business SDK (Java): https://github.com/facebook/facebook-java-business-sdk
- Business SDK (Ruby): https://github.com/facebook/facebook-ruby-business-sdk

> No Claudinho **não usamos SDK** — chamadas HTTP diretas via
> `fetch`, isoladas em `src/lib/meta-criar.ts` e `src/lib/meta.ts`.
> Razão: menos surface de dependência, mais controle sobre retry,
> logs e payloads.
