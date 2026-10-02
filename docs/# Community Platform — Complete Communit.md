# Community Platform — Complete Community Management & Governance System

Master product specification · Product requirements, system architecture, database design, AI-powered discovery, content, advertising, news, security, UX, APIs and engineering execution

Based on the project discussions and the two related documents I found in your Library, the community platform is intended to be much more than a conventional social network. It has a unified Space model supporting public communities, family groups, couple groups, solo spaces and custom private groups. It also includes agent capabilities, interest-based discovery, messaging, events, moderation, notifications and privacy controls.&#x20;

Pasted markdown.md



The documents establish an important distinction: your engineering-agent workflow is already extensively described, but the actual product's complete domain model, APIs, permissions, data architecture and implementation requirements still need consolidation.&#x20;

Pasted markdown.md



One limitation: I located and reviewed the two related Library documents and the relevant previous project context, but there is no connected source-code repository or complete set of implementation diagrams available in the current conversation. Therefore, this is a comprehensive proposed specification aligned with the established project, not a verified audit of every existing source file or diagram.

## Community management: complete module map

[Amity Social Cloud Reviews & Pricing 2026 | Goodfirms](https://images.openai.com/static-rsc-4/cDhbm7-_Hs1dvTb14hq5-8qlIMntluvbWBT0DSg9J0BPgmn1H17hhnKE--Eu_VFhkiZG9vWCTw2cZz9YIrD4hjo40AmBygq1jN-lvNHDlau6-WIYmERsC5Ej2XD3WijyugXIlNvdlM38XqMP80CHcTBjFNyxG8MdMajdwetOBUZC5YAugx-MOt8akk6QvTKg?purpose=fullsize)

Core governance and community capabilities

01

Community identity

Categories, tags, topics, language, location and branding

02

Membership governance

Applications, invitations, approvals, roles and access

03

Rules and policies

Community-specific conduct, posting rules and enforcement

04

Verification and trust

Identity, official status, evidence and verification reviews

05

Customization

Layouts, permissions, visibility and community configuration

06

Ownership and continuity

Ownership transfer, succession, delegation and recovery

07

Lifecycle management

Creation, activation, restriction, suspension, archive and deletion

08

Community content

Posts, discussions, announcements, media and resources

09

Interest-based discovery

Personalized feeds, recommendations and topic relevance

10

News and information

News aggregation, source attribution and community discussions

11

Advertising and monetization

Sponsored content, campaigns, controls and reporting

12

Analytics and insights

Membership, engagement, retention, safety and performance

13

Moderation operations

Reports, queues, enforcement, appeals and automation

14

Localization

Localized names, descriptions, rules and interface content

15

Community events

Events, calendars, registrations, tasks and budgets

16

AI community agents

Assistance, summaries, moderation support and governed automation

17

Privacy and data controls

Consent, retention, access, export and deletion

18

Platform administration

Global governance, audit, trust operations and configuration

# 1. Community domain and unified Space architecture

The foundation should be a shared Space domain, not separate implementations for every type of group.

\#chatgpt-mermaid-\_r_3m3\_{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;fill:rgb(13, 13, 13);}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-\_r_3m3\_ .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_3m3\_ .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_3m3\_ .error-icon{fill:rgb(255, 255, 255);}#chatgpt-mermaid-\_r_3m3\_ .error-text{fill:rgb(13, 13, 13);stroke:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3m3\_ .edge-thickness-normal{stroke-width:1px;}#chatgpt-mermaid-\_r_3m3\_ .edge-thickness-thick{stroke-width:3.5px;}#chatgpt-mermaid-\_r_3m3\_ .edge-pattern-solid{stroke-dasharray:0;}#chatgpt-mermaid-\_r_3m3\_ .edge-thickness-invisible{stroke-width:0;fill:none;}#chatgpt-mermaid-\_r_3m3\_ .edge-pattern-dashed{stroke-dasharray:3;}#chatgpt-mermaid-\_r_3m3\_ .edge-pattern-dotted{stroke-dasharray:2;}#chatgpt-mermaid-\_r_3m3\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3m3\_ .marker.cross{stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3m3\_ svg{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;}#chatgpt-mermaid-\_r_3m3\_ p{margin:0;}#chatgpt-mermaid-\_r_3m3\_ .label{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3m3\_ .cluster-label text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3m3\_ .cluster-label span{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3m3\_ .cluster-label span p{background-color:transparent;}#chatgpt-mermaid-\_r_3m3\_ .label text,#chatgpt-mermaid-\_r_3m3\_ span{fill:rgb(13, 13, 13);color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3m3\_ .node rect,#chatgpt-mermaid-\_r_3m3\_ .node circle,#chatgpt-mermaid-\_r_3m3\_ .node ellipse,#chatgpt-mermaid-\_r_3m3\_ .node polygon,#chatgpt-mermaid-\_r_3m3\_ .node path{fill:rgb(250, 232, 222);stroke:rgb(239, 139, 87);stroke-width:1px;}#chatgpt-mermaid-\_r_3m3\_ .rough-node .label text,#chatgpt-mermaid-\_r_3m3\_ .node .label text,#chatgpt-mermaid-\_r_3m3\_ .image-shape .label,#chatgpt-mermaid-\_r_3m3\_ .icon-shape .label{text-anchor:middle;}#chatgpt-mermaid-\_r_3m3\_ .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}#chatgpt-mermaid-\_r_3m3\_ .rough-node .label,#chatgpt-mermaid-\_r_3m3\_ .node .label,#chatgpt-mermaid-\_r_3m3\_ .image-shape .label,#chatgpt-mermaid-\_r_3m3\_ .icon-shape .label{text-align:center;}#chatgpt-mermaid-\_r_3m3\_ .node.clickable{cursor:pointer;}#chatgpt-mermaid-\_r_3m3\_ .root .anchor path{fill:rgb(143, 143, 143)!important;stroke-width:0;stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3m3\_ .arrowheadPath{fill:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3m3\_ .edgePath .path{stroke:rgb(143, 143, 143);stroke-width:1px;}#chatgpt-mermaid-\_r_3m3\_ .flowchart-link{stroke:rgb(143, 143, 143);fill:none;}#chatgpt-mermaid-\_r_3m3\_ .edgeLabel{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-\_r_3m3\_ .edgeLabel p{background-color:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_3m3\_ .edgeLabel rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_3m3\_ .labelBkg{background-color:rgba(252, 252, 252, 0.5);}#chatgpt-mermaid-\_r_3m3\_ .cluster rect{fill:rgb(255, 255, 255);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_3m3\_ .cluster text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3m3\_ .cluster span{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3m3\_ div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:12px;background:rgb(255, 255, 255);border:1px solid rgba(0, 0, 0, 0.1);border-radius:2px;pointer-events:none;z-index:100;}#chatgpt-mermaid-\_r_3m3\_ .flowchartTitleText{text-anchor:middle;font-size:18px;fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3m3\_ rect.text{fill:none;stroke-width:0;}#chatgpt-mermaid-\_r_3m3\_ .icon-shape,#chatgpt-mermaid-\_r_3m3\_ .image-shape{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-\_r_3m3\_ .icon-shape p,#chatgpt-mermaid-\_r_3m3\_ .image-shape p{background-color:rgb(252, 252, 252);padding:2px;}#chatgpt-mermaid-\_r_3m3\_ .icon-shape .label rect,#chatgpt-mermaid-\_r_3m3\_ .image-shape .label rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_3m3\_ .label-icon{display:inline-block;height:1em;overflow:visible;vertical-align:-0.125em;}#chatgpt-mermaid-\_r_3m3\_ .node .label-icon path{fill:currentColor;stroke:revert;stroke-width:revert;}#chatgpt-mermaid-\_r_3m3\_ .node .neo-node{stroke:rgb(239, 139, 87);}#chatgpt-mermaid-\_r_3m3\_ [data-look="neo"].node rect,#chatgpt-mermaid-\_r_3m3\_ [data-look="neo"].cluster rect,#chatgpt-mermaid-\_r_3m3\_ [data-look="neo"].node polygon{stroke:url(#chatgpt-mermaid-\_r_3m3\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3m3\_ [data-look="neo"].swimlane.cluster rect{filter:none;}#chatgpt-mermaid-\_r_3m3\_ [data-look="neo"].node path{stroke:url(#chatgpt-mermaid-\_r_3m3\_-gradient);stroke-width:1px;}#chatgpt-mermaid-\_r_3m3\_ [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3m3\_ [data-look="neo"].node .neo-line path{stroke:rgb(239, 139, 87);filter:none;}#chatgpt-mermaid-\_r_3m3\_ [data-look="neo"].node circle{stroke:url(#chatgpt-mermaid-\_r_3m3\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3m3\_ [data-look="neo"].node circle .state-start{fill:#000000;}#chatgpt-mermaid-\_r_3m3\_ [data-look="neo"].icon-shape .icon{fill:url(#chatgpt-mermaid-\_r_3m3\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3m3\_ [data-look="neo"].icon-shape .icon-neo path{stroke:url(#chatgpt-mermaid-\_r_3m3\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3m3\_ .node text{font-size:14px;font-weight:600;letter-spacing:normal;fill:rgb(109, 46, 15);}#chatgpt-mermaid-\_r_3m3\_ .edgeLabels text{font-size:13px;font-weight:600;letter-spacing:-0.08px;fill:rgb(109, 46, 15);}#chatgpt-mermaid-\_r_3m3\_ .node tspan[font-weight="normal"],#chatgpt-mermaid-\_r_3m3\_ .edgeLabels tspan[font-weight="normal"]{font-weight:600;}#chatgpt-mermaid-\_r_3m3\_ .edgeLabel .label rect{opacity:1;rx:13px;ry:13px;fill:rgb(255, 245, 240);stroke:rgb(229, 208, 195);stroke-width:1px;}#chatgpt-mermaid-\_r_3m3\_ .node rect,#chatgpt-mermaid-\_r_3m3\_ .node circle,#chatgpt-mermaid-\_r_3m3\_ .node ellipse,#chatgpt-mermaid-\_r_3m3\_ .node polygon,#chatgpt-mermaid-\_r_3m3\_ .node path{fill:rgb(255, 231, 217);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_3m3\_ .node rect{rx:16px;ry:16px;}#chatgpt-mermaid-\_r_3m3\_ .node.mermaid-decision .label-container{fill:rgb(255, 245, 240);stroke:rgb(229, 208, 195);stroke-dasharray:2,2;}#chatgpt-mermaid-\_r_3m3\_ .edgePaths .flowchart-link{stroke:rgb(143, 143, 143);stroke-width:1px;stroke-linecap:round;stroke-linejoin:round;}#chatgpt-mermaid-\_r_3m3\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3m3\_ :root{--mermaid-font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";}User / OrganizationUnified SpacePublic CommunityFamily SpaceCouple SpaceSolo SpaceCustom GroupGovernance EngineMembership and RBACRules and PoliciesLifecycleDiscovery and FeedAnalytics and Audit

## 1.1 Space types

| Type                   | Visibility                | Membership                         | Special capabilities                         |
| ---------------------- | ------------------------- | ---------------------------------- | -------------------------------------------- |
| Public community       | Public or discoverable    | Open, approval-based or restricted | Discovery, public content, followers         |
| Private family         | Private                   | Invitation and approval            | Family tasks, care, schedules and documents  |
| Couple                 | Private                   | Specific invited members           | Shared plans and private communication       |
| Solo                   | Private to owner          | Owner-controlled                   | Personal planning, private agent             |
| Custom group           | Configurable              | Configurable                       | User-defined rules and features              |
| Organization community | Public, private or hybrid | Organization-managed               | Official announcements, delegated governance |

Every Space has a stable ID and a type. Type-specific functionality is enabled through capabilities and policies, rather than duplicating the entire membership, permissions and content infrastructure.

## 1.2 Core community entity

A proposed community record:

```
Community
 ├── id
 ├── space_id
 ├── slug
 ├── name
 ├── description
 ├── category_id
 ├── visibility
 ├── join_policy
 ├── status
 ├── default_language
 ├── region
 ├── timezone
 ├── verification_status
 ├── branding_config
 ├── discovery_config
 ├── advertising_config
 ├── moderation_config
 ├── created_by
 ├── created_at
 ├── updated_at
 └── version
```

`Space` owns shared functionality. `Community` represents the public-community configuration. This distinction is important because a family group should not accidentally receive public discovery or advertising features merely because it shares the same underlying group model.

# 2. Community categories, subcategories and interest tags

Categories and tags are separate concepts.

- Categories represent a managed, hierarchical taxonomy.
- Subcategories narrow the topic.
- Tags are flexible descriptors that can overlap multiple categories.
- Interests represent user preferences and personalization signals.
- Attributes such as region, language and age suitability are additional filtering dimensions.

[Dashboard for a Global Woman's Community by Alina Ulybina on Dribbble](https://images.openai.com/static-rsc-4/UUvZwQec0hNEUt81d7DJuNkkY7BNyxng-w8hhowdH0MMcC-uYR5zJS242c_siev_w-tw48XiS-jnXukbwJ8UdlABGadpFP48DJYw9xMapIELRaGoDPbdACn-V3unL5cxZouHAk5JuPG2Sb5fhG6E3YEvtcjoGtG9X46E0pL82eikUNubU2BT6b-edTDvsROf?purpose=fullsize)

[Hobby Discovery App by Emote on Dribbble](https://images.openai.com/static-rsc-4/GvBO9Zv-YTwEA1ci7lxJuFXeQXQgpkwX87PpthR1u1rAADmY4l0neoZ-RPNAk4H7fyu_M1aAvtAZvKKACW1dyk7qQiVYuTK_er-4wjqrrU50gI_6Y6QrrWUvj8kWrNFO-Qcx0cK04v2yX8ow3ZmAUp-hoZ423stjpC8014m3SbJJYs_6peSGcaT2PxlqmFW9?purpose=fullsize)

[Modernizzare il tema Foundation - Annunci - Discourse Meta](https://images.openai.com/static-rsc-4/AsS-bj46QkqbXOiK8wCN4v4Et1YGnnlWQN1fBMP1ra4nHGBXCEzMCY1bdTBbY5TqZGiwVKiOv0pKqyZqjog1pqtxHZGGifJz2ajLGeXJgHdq8cmS-VRN3sWTF5Hgu-U2rlWAWRAeJdNgLa2lNzW6WuLYeZWp5lET5Tzkz7d0k5CxExzXCZ9OEdjs2fiytkvC?purpose=fullsize)

13

## 2.1 Category taxonomy

Illustrative taxonomy:

| Category                 | Subcategories                                            |
| ------------------------ | -------------------------------------------------------- |
| Technology               | AI, software development, cybersecurity, robotics, cloud |
| Education                | School, university, research, exam preparation, learning |
| Business                 | Entrepreneurship, startups, finance, careers, management |
| Science                  | Physics, biology, mathematics, astronomy, engineering    |
| Entertainment            | Movies, music, television, gaming, creators              |
| Sports                   | Cricket, football, basketball, fitness, esports          |
| Lifestyle                | Cooking, fashion, travel, hobbies, wellness              |
| Regional                 | City communities, regional culture, local services       |
| Family                   | Parenting, family activities, family organization        |
| News and current affairs | Local news, science news, technology news, world affairs |

These are examples, not a final fixed taxonomy. Categories should be managed centrally and versioned.

### Database model

```
categories
  id
  parent_id
  slug
  status
  sort_order
  created_at

category_translations
  category_id
  locale
  display_name
  description

community_categories
  community_id
  category_id
  is_primary
  created_at

tags
  id
  normalized_name
  status
  created_by
  usage_count

community_tags
  community_id
  tag_id
  created_at

user_interests
  user_id
  tag_id
  preference_weight
  source
  updated_at
```

### Required functionality

- Multiple category and tag associations.
- A required primary category for eligible public communities.
- Category search and browsing.
- Tag autocomplete and duplicate detection.
- Localized category names.
- Restricted and prohibited tag lists.
- Tag synonyms and spelling normalization.
- Category migration and redirects.
- Abuse detection for misleading category or tag usage.
- Administrative taxonomy management.
- Popular and emerging topic identification.

A community called Hyderabad AI Builders could have Technology as its primary category and AI, Startups, Hyderabad and Machine Learning as additional tags.

A tag must not independently grant access, determine community eligibility or override a privacy setting.

# 3. Interest-based feed, news and advertising integration

This is a central product capability because community governance directly affects what content the discovery system is allowed to show.

[App Design | Wir erstellen Dein professionelles UI/UX Design für Apps, Webseiten, Spiele und VR/AR Interfaces.](https://images.openai.com/static-rsc-4/wpy0fuJufrpTVVIXzAWiIwENFSOHjhc-zKBoN2wymgq3jcTiVQ1apPUmC3FULTi-7h2zdbak1RPoeQCwXcmyhVcKwfHn1P57JHaYaZEJ4wjAaiohGFCJZHDyQQJ3vPU2IEP4cdFCX5JbALRSuuNvxiI1Kh09I757MSRHJvQatK8hMc1xQBKOaMUG7FjXXMSL?purpose=fullsize)

## 3.1 Content sources

The feed should be built from explicitly defined sources:

| Source                      | Examples                         | Access control                                    |
| --------------------------- | -------------------------------- | ------------------------------------------------- |
| Followed communities        | Posts and announcements          | Follow and visibility rules                       |
| Joined communities          | Member discussions and posts     | Active membership and posting permissions         |
| User interests              | Relevant public posts            | User preferences and public visibility            |
| News sources                | Attributed news articles         | Content rights, source policy and region          |
| Local discovery             | Nearby public communities        | Location permissions and geographic rules         |
| Events                      | Community events and invitations | Visibility, eligibility and membership            |
| Sponsored content           | Advertisements                   | Consent, targeting eligibility and campaign rules |
| Agent-generated suggestions | Summaries and topic suggestions  | Explicit source authorization and AI policy       |

The feed service must enforce privacy and eligibility before relevance ranking. A highly relevant private post is still inaccessible to a user who does not have permission to see it.

## 3.2 Feed pipeline

\#chatgpt-mermaid-\_r_3n3\_{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;fill:rgb(13, 13, 13);}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-\_r_3n3\_ .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_3n3\_ .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_3n3\_ .error-icon{fill:rgb(255, 255, 255);}#chatgpt-mermaid-\_r_3n3\_ .error-text{fill:rgb(13, 13, 13);stroke:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3n3\_ .edge-thickness-normal{stroke-width:1px;}#chatgpt-mermaid-\_r_3n3\_ .edge-thickness-thick{stroke-width:3.5px;}#chatgpt-mermaid-\_r_3n3\_ .edge-pattern-solid{stroke-dasharray:0;}#chatgpt-mermaid-\_r_3n3\_ .edge-thickness-invisible{stroke-width:0;fill:none;}#chatgpt-mermaid-\_r_3n3\_ .edge-pattern-dashed{stroke-dasharray:3;}#chatgpt-mermaid-\_r_3n3\_ .edge-pattern-dotted{stroke-dasharray:2;}#chatgpt-mermaid-\_r_3n3\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3n3\_ .marker.cross{stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3n3\_ svg{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;}#chatgpt-mermaid-\_r_3n3\_ p{margin:0;}#chatgpt-mermaid-\_r_3n3\_ .label{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3n3\_ .cluster-label text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3n3\_ .cluster-label span{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3n3\_ .cluster-label span p{background-color:transparent;}#chatgpt-mermaid-\_r_3n3\_ .label text,#chatgpt-mermaid-\_r_3n3\_ span{fill:rgb(13, 13, 13);color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3n3\_ .node rect,#chatgpt-mermaid-\_r_3n3\_ .node circle,#chatgpt-mermaid-\_r_3n3\_ .node ellipse,#chatgpt-mermaid-\_r_3n3\_ .node polygon,#chatgpt-mermaid-\_r_3n3\_ .node path{fill:rgb(250, 232, 222);stroke:rgb(239, 139, 87);stroke-width:1px;}#chatgpt-mermaid-\_r_3n3\_ .rough-node .label text,#chatgpt-mermaid-\_r_3n3\_ .node .label text,#chatgpt-mermaid-\_r_3n3\_ .image-shape .label,#chatgpt-mermaid-\_r_3n3\_ .icon-shape .label{text-anchor:middle;}#chatgpt-mermaid-\_r_3n3\_ .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}#chatgpt-mermaid-\_r_3n3\_ .rough-node .label,#chatgpt-mermaid-\_r_3n3\_ .node .label,#chatgpt-mermaid-\_r_3n3\_ .image-shape .label,#chatgpt-mermaid-\_r_3n3\_ .icon-shape .label{text-align:center;}#chatgpt-mermaid-\_r_3n3\_ .node.clickable{cursor:pointer;}#chatgpt-mermaid-\_r_3n3\_ .root .anchor path{fill:rgb(143, 143, 143)!important;stroke-width:0;stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3n3\_ .arrowheadPath{fill:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3n3\_ .edgePath .path{stroke:rgb(143, 143, 143);stroke-width:1px;}#chatgpt-mermaid-\_r_3n3\_ .flowchart-link{stroke:rgb(143, 143, 143);fill:none;}#chatgpt-mermaid-\_r_3n3\_ .edgeLabel{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-\_r_3n3\_ .edgeLabel p{background-color:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_3n3\_ .edgeLabel rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_3n3\_ .labelBkg{background-color:rgba(252, 252, 252, 0.5);}#chatgpt-mermaid-\_r_3n3\_ .cluster rect{fill:rgb(255, 255, 255);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_3n3\_ .cluster text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3n3\_ .cluster span{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3n3\_ div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:12px;background:rgb(255, 255, 255);border:1px solid rgba(0, 0, 0, 0.1);border-radius:2px;pointer-events:none;z-index:100;}#chatgpt-mermaid-\_r_3n3\_ .flowchartTitleText{text-anchor:middle;font-size:18px;fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3n3\_ rect.text{fill:none;stroke-width:0;}#chatgpt-mermaid-\_r_3n3\_ .icon-shape,#chatgpt-mermaid-\_r_3n3\_ .image-shape{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-\_r_3n3\_ .icon-shape p,#chatgpt-mermaid-\_r_3n3\_ .image-shape p{background-color:rgb(252, 252, 252);padding:2px;}#chatgpt-mermaid-\_r_3n3\_ .icon-shape .label rect,#chatgpt-mermaid-\_r_3n3\_ .image-shape .label rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_3n3\_ .label-icon{display:inline-block;height:1em;overflow:visible;vertical-align:-0.125em;}#chatgpt-mermaid-\_r_3n3\_ .node .label-icon path{fill:currentColor;stroke:revert;stroke-width:revert;}#chatgpt-mermaid-\_r_3n3\_ .node .neo-node{stroke:rgb(239, 139, 87);}#chatgpt-mermaid-\_r_3n3\_ [data-look="neo"].node rect,#chatgpt-mermaid-\_r_3n3\_ [data-look="neo"].cluster rect,#chatgpt-mermaid-\_r_3n3\_ [data-look="neo"].node polygon{stroke:url(#chatgpt-mermaid-\_r_3n3\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3n3\_ [data-look="neo"].swimlane.cluster rect{filter:none;}#chatgpt-mermaid-\_r_3n3\_ [data-look="neo"].node path{stroke:url(#chatgpt-mermaid-\_r_3n3\_-gradient);stroke-width:1px;}#chatgpt-mermaid-\_r_3n3\_ [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3n3\_ [data-look="neo"].node .neo-line path{stroke:rgb(239, 139, 87);filter:none;}#chatgpt-mermaid-\_r_3n3\_ [data-look="neo"].node circle{stroke:url(#chatgpt-mermaid-\_r_3n3\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3n3\_ [data-look="neo"].node circle .state-start{fill:#000000;}#chatgpt-mermaid-\_r_3n3\_ [data-look="neo"].icon-shape .icon{fill:url(#chatgpt-mermaid-\_r_3n3\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3n3\_ [data-look="neo"].icon-shape .icon-neo path{stroke:url(#chatgpt-mermaid-\_r_3n3\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3n3\_ .node text{font-size:14px;font-weight:600;letter-spacing:normal;fill:rgb(109, 46, 15);}#chatgpt-mermaid-\_r_3n3\_ .edgeLabels text{font-size:13px;font-weight:600;letter-spacing:-0.08px;fill:rgb(109, 46, 15);}#chatgpt-mermaid-\_r_3n3\_ .node tspan[font-weight="normal"],#chatgpt-mermaid-\_r_3n3\_ .edgeLabels tspan[font-weight="normal"]{font-weight:600;}#chatgpt-mermaid-\_r_3n3\_ .edgeLabel .label rect{opacity:1;rx:13px;ry:13px;fill:rgb(255, 245, 240);stroke:rgb(229, 208, 195);stroke-width:1px;}#chatgpt-mermaid-\_r_3n3\_ .node rect,#chatgpt-mermaid-\_r_3n3\_ .node circle,#chatgpt-mermaid-\_r_3n3\_ .node ellipse,#chatgpt-mermaid-\_r_3n3\_ .node polygon,#chatgpt-mermaid-\_r_3n3\_ .node path{fill:rgb(255, 231, 217);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_3n3\_ .node rect{rx:16px;ry:16px;}#chatgpt-mermaid-\_r_3n3\_ .node.mermaid-decision .label-container{fill:rgb(255, 245, 240);stroke:rgb(229, 208, 195);stroke-dasharray:2,2;}#chatgpt-mermaid-\_r_3n3\_ .edgePaths .flowchart-link{stroke:rgb(143, 143, 143);stroke-width:1px;stroke-linecap:round;stroke-linejoin:round;}#chatgpt-mermaid-\_r_3n3\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3n3\_ :root{--mermaid-font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";}User opens feedResolve user and consentResolve accessible SpacesRetrieve eligible contentEligibility and safety filtersRelevance and freshnessrankingEligible sponsored candidatesMerge and apply placementpolicyReturn cursor-paginated feedRecord permitted impressionsCollect feedback andengagement

### Ranking signals

The feed can consider:

- Selected user interests.
- Follow relationships.
- Community membership.
- Post recency.
- Topic similarity.
- Meaningful engagement signals.
- Explicit user feedback.
- Content quality and safety.
- Language compatibility.
- Repeated exposure and diversity.
- User-selected feed mode.

Signals should have documented purposes and privacy constraints.

Avoid allowing raw engagement maximization to dominate. Otherwise, sensational, repetitive or polarizing content may receive disproportionate distribution.

### User feed controls

- Following-only feed.
- Latest or chronological feed.
- Personalized feed.
- Interest selection and editing.
- Hide topic.
- Mute community.
- Not interested.
- Reduce recommendations.
- Sponsored-content controls.
- Reset personalization.
- Explain why a post appeared.
- Report or block.

### Performance architecture

For early production:

- PostgreSQL for authoritative content and relationship data.
- Redis for short-lived feed caches and rate limits.
- A search index for full-text and topic retrieval when required.
- Asynchronous workers for feed materialization and ranking features.
- Cursor-based pagination.
- A hybrid fan-out strategy for communities with highly unequal activity levels.

Do not make every user action trigger a synchronous recomputation of the entire feed.

## 3.3 News system

News needs a separate content pipeline instead of treating external articles as ordinary user posts.

```
Source Registry
     ↓
Scheduled Ingestion
     ↓
Source and Rights Validation
     ↓
Article Metadata Extraction
     ↓
Deduplication
     ↓
Topic and Language Classification
     ↓
Attribution and Trust Metadata
     ↓
News Index
     ↓
Eligible Community News Feed
```

Proposed article fields:

```
NewsArticle
 ├── id
 ├── source_id
 ├── canonical_url
 ├── headline
 ├── summary
 ├── language
 ├── published_at
 ├── fetched_at
 ├── topic_ids
 ├── region
 ├── attribution
 ├── rights_status
 ├── content_hash
 └── review_status
```

Requirements:

- Source identity and article attribution.
- Canonical URL handling.
- Duplicate detection.
- Language and regional classification.
- News source configuration.
- Removal and correction workflows.
- Clear distinction between article content, editorial summaries and community commentary.
- Source reliability metadata with documented methodology.
- Publisher restrictions and content licensing.
- Misinformation and manipulated-media reporting.
- News discussion moderation.
- Political-content and sensitive-topic policy controls.
- Clear labeling for AI-generated summaries.

The platform should not silently present an AI-generated summary as the original publisher's words.

## 3.4 Advertising system

Advertising is a separate platform subsystem with its own eligibility and governance rules.

### Advertising architecture

\#chatgpt-mermaid-\_r_3nu\_{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;fill:rgb(13, 13, 13);}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-\_r_3nu\_ .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_3nu\_ .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_3nu\_ .error-icon{fill:rgb(255, 255, 255);}#chatgpt-mermaid-\_r_3nu\_ .error-text{fill:rgb(13, 13, 13);stroke:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3nu\_ .edge-thickness-normal{stroke-width:1px;}#chatgpt-mermaid-\_r_3nu\_ .edge-thickness-thick{stroke-width:3.5px;}#chatgpt-mermaid-\_r_3nu\_ .edge-pattern-solid{stroke-dasharray:0;}#chatgpt-mermaid-\_r_3nu\_ .edge-thickness-invisible{stroke-width:0;fill:none;}#chatgpt-mermaid-\_r_3nu\_ .edge-pattern-dashed{stroke-dasharray:3;}#chatgpt-mermaid-\_r_3nu\_ .edge-pattern-dotted{stroke-dasharray:2;}#chatgpt-mermaid-\_r_3nu\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3nu\_ .marker.cross{stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3nu\_ svg{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;}#chatgpt-mermaid-\_r_3nu\_ p{margin:0;}#chatgpt-mermaid-\_r_3nu\_ .label{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3nu\_ .cluster-label text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3nu\_ .cluster-label span{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3nu\_ .cluster-label span p{background-color:transparent;}#chatgpt-mermaid-\_r_3nu\_ .label text,#chatgpt-mermaid-\_r_3nu\_ span{fill:rgb(13, 13, 13);color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3nu\_ .node rect,#chatgpt-mermaid-\_r_3nu\_ .node circle,#chatgpt-mermaid-\_r_3nu\_ .node ellipse,#chatgpt-mermaid-\_r_3nu\_ .node polygon,#chatgpt-mermaid-\_r_3nu\_ .node path{fill:rgb(250, 232, 222);stroke:rgb(239, 139, 87);stroke-width:1px;}#chatgpt-mermaid-\_r_3nu\_ .rough-node .label text,#chatgpt-mermaid-\_r_3nu\_ .node .label text,#chatgpt-mermaid-\_r_3nu\_ .image-shape .label,#chatgpt-mermaid-\_r_3nu\_ .icon-shape .label{text-anchor:middle;}#chatgpt-mermaid-\_r_3nu\_ .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}#chatgpt-mermaid-\_r_3nu\_ .rough-node .label,#chatgpt-mermaid-\_r_3nu\_ .node .label,#chatgpt-mermaid-\_r_3nu\_ .image-shape .label,#chatgpt-mermaid-\_r_3nu\_ .icon-shape .label{text-align:center;}#chatgpt-mermaid-\_r_3nu\_ .node.clickable{cursor:pointer;}#chatgpt-mermaid-\_r_3nu\_ .root .anchor path{fill:rgb(143, 143, 143)!important;stroke-width:0;stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3nu\_ .arrowheadPath{fill:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3nu\_ .edgePath .path{stroke:rgb(143, 143, 143);stroke-width:1px;}#chatgpt-mermaid-\_r_3nu\_ .flowchart-link{stroke:rgb(143, 143, 143);fill:none;}#chatgpt-mermaid-\_r_3nu\_ .edgeLabel{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-\_r_3nu\_ .edgeLabel p{background-color:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_3nu\_ .edgeLabel rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_3nu\_ .labelBkg{background-color:rgba(252, 252, 252, 0.5);}#chatgpt-mermaid-\_r_3nu\_ .cluster rect{fill:rgb(255, 255, 255);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_3nu\_ .cluster text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3nu\_ .cluster span{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3nu\_ div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:12px;background:rgb(255, 255, 255);border:1px solid rgba(0, 0, 0, 0.1);border-radius:2px;pointer-events:none;z-index:100;}#chatgpt-mermaid-\_r_3nu\_ .flowchartTitleText{text-anchor:middle;font-size:18px;fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3nu\_ rect.text{fill:none;stroke-width:0;}#chatgpt-mermaid-\_r_3nu\_ .icon-shape,#chatgpt-mermaid-\_r_3nu\_ .image-shape{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-\_r_3nu\_ .icon-shape p,#chatgpt-mermaid-\_r_3nu\_ .image-shape p{background-color:rgb(252, 252, 252);padding:2px;}#chatgpt-mermaid-\_r_3nu\_ .icon-shape .label rect,#chatgpt-mermaid-\_r_3nu\_ .image-shape .label rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_3nu\_ .label-icon{display:inline-block;height:1em;overflow:visible;vertical-align:-0.125em;}#chatgpt-mermaid-\_r_3nu\_ .node .label-icon path{fill:currentColor;stroke:revert;stroke-width:revert;}#chatgpt-mermaid-\_r_3nu\_ .node .neo-node{stroke:rgb(239, 139, 87);}#chatgpt-mermaid-\_r_3nu\_ [data-look="neo"].node rect,#chatgpt-mermaid-\_r_3nu\_ [data-look="neo"].cluster rect,#chatgpt-mermaid-\_r_3nu\_ [data-look="neo"].node polygon{stroke:url(#chatgpt-mermaid-\_r_3nu\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3nu\_ [data-look="neo"].swimlane.cluster rect{filter:none;}#chatgpt-mermaid-\_r_3nu\_ [data-look="neo"].node path{stroke:url(#chatgpt-mermaid-\_r_3nu\_-gradient);stroke-width:1px;}#chatgpt-mermaid-\_r_3nu\_ [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3nu\_ [data-look="neo"].node .neo-line path{stroke:rgb(239, 139, 87);filter:none;}#chatgpt-mermaid-\_r_3nu\_ [data-look="neo"].node circle{stroke:url(#chatgpt-mermaid-\_r_3nu\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3nu\_ [data-look="neo"].node circle .state-start{fill:#000000;}#chatgpt-mermaid-\_r_3nu\_ [data-look="neo"].icon-shape .icon{fill:url(#chatgpt-mermaid-\_r_3nu\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3nu\_ [data-look="neo"].icon-shape .icon-neo path{stroke:url(#chatgpt-mermaid-\_r_3nu\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3nu\_ .node text{font-size:14px;font-weight:600;letter-spacing:normal;fill:rgb(109, 46, 15);}#chatgpt-mermaid-\_r_3nu\_ .edgeLabels text{font-size:13px;font-weight:600;letter-spacing:-0.08px;fill:rgb(109, 46, 15);}#chatgpt-mermaid-\_r_3nu\_ .node tspan[font-weight="normal"],#chatgpt-mermaid-\_r_3nu\_ .edgeLabels tspan[font-weight="normal"]{font-weight:600;}#chatgpt-mermaid-\_r_3nu\_ .edgeLabel .label rect{opacity:1;rx:13px;ry:13px;fill:rgb(255, 245, 240);stroke:rgb(229, 208, 195);stroke-width:1px;}#chatgpt-mermaid-\_r_3nu\_ .node rect,#chatgpt-mermaid-\_r_3nu\_ .node circle,#chatgpt-mermaid-\_r_3nu\_ .node ellipse,#chatgpt-mermaid-\_r_3nu\_ .node polygon,#chatgpt-mermaid-\_r_3nu\_ .node path{fill:rgb(255, 231, 217);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_3nu\_ .node rect{rx:16px;ry:16px;}#chatgpt-mermaid-\_r_3nu\_ .node.mermaid-decision .label-container{fill:rgb(255, 245, 240);stroke:rgb(229, 208, 195);stroke-dasharray:2,2;}#chatgpt-mermaid-\_r_3nu\_ .edgePaths .flowchart-link{stroke:rgb(143, 143, 143);stroke-width:1px;stroke-linecap:round;stroke-linejoin:round;}#chatgpt-mermaid-\_r_3nu\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3nu\_ :root{--mermaid-font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";}Advertiser or campaignmanagerCampaign configurationPolicy, consent and eligibilityTargeting constraintsEligible campaign poolAd placement serviceFeed impressionClick or conversion eventReporting and billing

Campaign fields:

```
AdCampaign
 ├── id
 ├── advertiser_id
 ├── name
 ├── objective
 ├── budget
 ├── bid_strategy
 ├── start_at
 ├── end_at
 ├── status
 ├── creative_ids
 ├── targeting_policy_id
 ├── consent_requirements
 └── review_status
```

Governance requirements:

- Clear sponsored labeling.
- Advertiser verification where appropriate.
- Campaign and creative review.
- Budget limits.
- Frequency caps.
- Delivery and conversion reporting.
- Campaign pause and termination.
- Fraud and invalid-traffic detection.
- User ad preferences.
- Advertiser account suspension.
- Audit history.
- Regional advertising restrictions.
- Data minimization and consent.
- Community-level sponsored-content settings.
- Protection against advertising in sensitive private spaces.

A crucial privacy boundary: private family, couple and solo spaces should not become advertising-targeting data sources by default. Sensitive data and private conversations should not be used to infer advertising audiences.

The ad system should receive an eligibility decision and only the minimum information needed to place and report an advertisement.

# 4. Community rules and policy engine

Community rules are not just text displayed on a page. They must be enforceable through the platform's authorization, moderation and publishing systems.

## 4.1 Rule categories

| Rule category  | Example                                                |
| -------------- | ------------------------------------------------------ |
| Posting        | Only members can publish posts                         |
| Content        | No spam, scams or prohibited content                   |
| Behavior       | No targeted harassment                                 |
| Promotion      | Commercial promotions require approval                 |
| Membership     | New members must answer application questions          |
| Media          | Restrict specific media types or file sizes            |
| External links | Links from untrusted accounts require review           |
| Events         | Only organizers can create official events             |
| Announcements  | Only designated roles can publish priority messages    |
| Privacy        | No sharing members' private information                |
| AI             | Disclose AI-generated content where policy requires it |

## 4.2 Rule engine structure

```
CommunityPolicy
 ├── policy_id
 ├── community_id
 ├── version
 ├── effective_at
 ├── status
 └── rules[]

Rule
 ├── id
 ├── category
 ├── condition
 ├── action
 ├── severity
 ├── exceptions
 ├── appeal_allowed
 └── enabled
```

A policy evaluation should return a structured result:

```
{
  "decision": "REVIEW_REQUIRED",
  "reason_codes": ["EXTERNAL_LINK_REVIEW"],
  "policy_version": 4,
  "required_actions": ["MODERATOR_REVIEW"]
}
```

This is an illustrative contract, not an implemented API response.

The policy engine must support:

- Versioning.
- Effective dates.
- Explicit precedence.
- Deterministic rule evaluation.
- Exceptions with documented authorization.
- Evaluation logs.
- Safe defaults.
- Human review for uncertain or high-impact decisions.
- Regression tests for policy changes.

## 4.3 Policy precedence

The order of authority should be defined explicitly.

```
Platform-wide mandatory policy
             ↓
Legal and regional restrictions
             ↓
Space-type privacy and safety constraints
             ↓
Community-specific rules
             ↓
Member-specific restrictions
             ↓
Individual action authorization
```

The precise precedence between applicable regional rules and platform policy must be implemented through a documented legal and policy configuration. A community administrator must never override a platform-wide security restriction by changing community settings.

# 5. Community verification and trust

Verification should represent a specific claim rather than a generic badge of superiority.

[CoinMarketCap(CMC) Community Verification (Blue tick) badge for any project or individuals - Crypto Services - SWAPD](https://images.openai.com/static-rsc-4/dcZJhSo7pjpWV9W-KsJF14ecW_1OSNDxqV6dD74CDtrQH9C_1-ds0paRMmEnqTBxWQSFhSKopVOoH0mXetSHOCOiiQjE68gbaJVqIwvSyX-CDoC_dJ5--Zz-DSlGggLGk2tiAfupwdzt2YIMhC0qwg-Jtokm5iHtss1mV6elIfSdN971_ZIHtNkp7KWywn6s?purpose=fullsize)

## Verification types

- Official organization.
- Public institution.
- Recognized community representative.
- Organization-managed account.
- Trusted community identity.
- Other narrowly defined platform verification categories.

## Verification lifecycle

\#chatgpt-mermaid-\_r_3p3\_{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;fill:rgb(13, 13, 13);}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-\_r_3p3\_ .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_3p3\_ .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_3p3\_ .error-icon{fill:rgb(255, 255, 255);}#chatgpt-mermaid-\_r_3p3\_ .error-text{fill:rgb(13, 13, 13);stroke:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3p3\_ .edge-thickness-normal{stroke-width:1px;}#chatgpt-mermaid-\_r_3p3\_ .edge-thickness-thick{stroke-width:3.5px;}#chatgpt-mermaid-\_r_3p3\_ .edge-pattern-solid{stroke-dasharray:0;}#chatgpt-mermaid-\_r_3p3\_ .edge-thickness-invisible{stroke-width:0;fill:none;}#chatgpt-mermaid-\_r_3p3\_ .edge-pattern-dashed{stroke-dasharray:3;}#chatgpt-mermaid-\_r_3p3\_ .edge-pattern-dotted{stroke-dasharray:2;}#chatgpt-mermaid-\_r_3p3\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3p3\_ .marker.cross{stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3p3\_ svg{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;}#chatgpt-mermaid-\_r_3p3\_ p{margin:0;}#chatgpt-mermaid-\_r_3p3\_ defs [id$="-barbEnd"]{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3p3\_ g.stateGroup text{fill:rgb(239, 139, 87);stroke:none;font-size:10px;}#chatgpt-mermaid-\_r_3p3\_ g.stateGroup text{fill:rgb(13, 13, 13);stroke:none;font-size:10px;}#chatgpt-mermaid-\_r_3p3\_ g.stateGroup .state-title{font-weight:bolder;fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3p3\_ g.stateGroup rect{fill:rgb(250, 232, 222);stroke:rgb(239, 139, 87);}#chatgpt-mermaid-\_r_3p3\_ g.stateGroup line{stroke:rgb(143, 143, 143);stroke-width:1;}#chatgpt-mermaid-\_r_3p3\_ .transition{stroke:rgb(143, 143, 143);stroke-width:1;fill:none;}#chatgpt-mermaid-\_r_3p3\_ .stateGroup .composit{fill:transparent;border-bottom:1px;}#chatgpt-mermaid-\_r_3p3\_ .stateGroup .alt-composit{fill:#e0e0e0;border-bottom:1px;}#chatgpt-mermaid-\_r_3p3\_ .state-note{stroke:rgb(248, 212, 93);fill:rgb(255, 255, 255);}#chatgpt-mermaid-\_r_3p3\_ .state-note text{fill:rgb(13, 13, 13);stroke:none;font-size:10px;}#chatgpt-mermaid-\_r_3p3\_ .stateLabel .box{stroke:none;stroke-width:0;fill:rgb(250, 232, 222);opacity:0.5;}#chatgpt-mermaid-\_r_3p3\_ .edgeLabel .label rect{fill:rgb(250, 232, 222);opacity:0.5;}#chatgpt-mermaid-\_r_3p3\_ .edgeLabel{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-\_r_3p3\_ .edgeLabel p{background-color:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_3p3\_ .edgeLabel rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_3p3\_ .edgeLabel .label text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3p3\_ .label div .edgeLabel{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3p3\_ .stateLabel text{fill:rgb(13, 13, 13);font-size:10px;font-weight:bold;}#chatgpt-mermaid-\_r_3p3\_ .node circle.state-start{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3p3\_ .node .fork-join{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3p3\_ .node circle.state-end{fill:rgb(239, 139, 87);stroke:transparent;stroke-width:1.5;}#chatgpt-mermaid-\_r_3p3\_ .end-state-inner{fill:transparent;stroke-width:1.5;}#chatgpt-mermaid-\_r_3p3\_ .node rect{fill:rgb(250, 232, 222);stroke:rgb(239, 139, 87);stroke-width:1px;}#chatgpt-mermaid-\_r_3p3\_ .node polygon{fill:rgb(250, 232, 222);stroke:rgb(239, 139, 87);stroke-width:1px;}#chatgpt-mermaid-\_r_3p3\_ [id$="-barbEnd"]{fill:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3p3\_ .statediagram-cluster rect{fill:rgb(250, 232, 222);stroke:rgb(239, 139, 87);stroke-width:1px;}#chatgpt-mermaid-\_r_3p3\_ .cluster-label,#chatgpt-mermaid-\_r_3p3\_ .nodeLabel{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3p3\_ .statediagram-cluster rect.outer{rx:5px;ry:5px;}#chatgpt-mermaid-\_r_3p3\_ .statediagram-state .divider{stroke:rgb(239, 139, 87);}#chatgpt-mermaid-\_r_3p3\_ .statediagram-state .title-state{rx:5px;ry:5px;}#chatgpt-mermaid-\_r_3p3\_ .statediagram-cluster.statediagram-cluster .inner{fill:transparent;}#chatgpt-mermaid-\_r_3p3\_ .statediagram-cluster.statediagram-cluster-alt .inner{fill:rgb(255, 255, 255);}#chatgpt-mermaid-\_r_3p3\_ .statediagram-cluster .inner{rx:0;ry:0;}#chatgpt-mermaid-\_r_3p3\_ .statediagram-state rect.basic{rx:5px;ry:5px;}#chatgpt-mermaid-\_r_3p3\_ .statediagram-state rect.divider{stroke-dasharray:10,10;fill:rgb(255, 255, 255);}#chatgpt-mermaid-\_r_3p3\_ .note-edge{stroke-dasharray:5;}#chatgpt-mermaid-\_r_3p3\_ .statediagram-note rect{fill:rgb(255, 255, 255);stroke:rgb(248, 212, 93);stroke-width:1px;rx:0;ry:0;}#chatgpt-mermaid-\_r_3p3\_ .statediagram-note rect{fill:rgb(255, 255, 255);stroke:rgb(248, 212, 93);stroke-width:1px;rx:0;ry:0;}#chatgpt-mermaid-\_r_3p3\_ .statediagram-note text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3p3\_ .statediagram-note .nodeLabel{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3p3\_ .statediagram .edgeLabel{color:red;}#chatgpt-mermaid-\_r_3p3\_ [id$="-dependencyStart"],#chatgpt-mermaid-\_r_3p3\_ [id$="-dependencyEnd"]{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);stroke-width:1;}#chatgpt-mermaid-\_r_3p3\_ .statediagramTitleText{text-anchor:middle;font-size:18px;fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3p3\_ [data-look="neo"].statediagram-cluster rect{fill:rgb(250, 232, 222);stroke:url(#chatgpt-mermaid-\_r_3p3\_-gradient);stroke-width:1;}#chatgpt-mermaid-\_r_3p3\_ [data-look="neo"].statediagram-cluster rect.outer{rx:5px;ry:5px;filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3p3\_ .node .neo-node{stroke:rgb(239, 139, 87);}#chatgpt-mermaid-\_r_3p3\_ [data-look="neo"].node rect,#chatgpt-mermaid-\_r_3p3\_ [data-look="neo"].cluster rect,#chatgpt-mermaid-\_r_3p3\_ [data-look="neo"].node polygon{stroke:url(#chatgpt-mermaid-\_r_3p3\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3p3\_ [data-look="neo"].swimlane.cluster rect{filter:none;}#chatgpt-mermaid-\_r_3p3\_ [data-look="neo"].node path{stroke:url(#chatgpt-mermaid-\_r_3p3\_-gradient);stroke-width:1px;}#chatgpt-mermaid-\_r_3p3\_ [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3p3\_ [data-look="neo"].node .neo-line path{stroke:rgb(239, 139, 87);filter:none;}#chatgpt-mermaid-\_r_3p3\_ [data-look="neo"].node circle{stroke:url(#chatgpt-mermaid-\_r_3p3\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3p3\_ [data-look="neo"].node circle .state-start{fill:#000000;}#chatgpt-mermaid-\_r_3p3\_ [data-look="neo"].icon-shape .icon{fill:url(#chatgpt-mermaid-\_r_3p3\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3p3\_ [data-look="neo"].icon-shape .icon-neo path{stroke:url(#chatgpt-mermaid-\_r_3p3\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3p3\_ :root{--mermaid-font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";}UnverifiedApplicationSubmittedEvidenceReviewMoreInformationRequiredApprovedRejectedPeriodicReviewSuspendedRevokedReinstatementReview

### Evidence and review

The verification application should capture:

- Claimed identity.
- Organization or community details.
- Evidence documents.
- Authorized representative information.
- Requested verification category.
- Verification reviewer.
- Decision reason.
- Expiration or revalidation requirements.
- Appeal information.

Verification data should be access-restricted. Sensitive evidence should not be publicly exposed.

The public interface should communicate exactly what has been verified and avoid implying endorsement, guaranteed factual accuracy or a particular level of community quality.

# 6. Community customization and configuration

Community customization should use typed, validated configuration rather than arbitrary client-defined JSON that could create security inconsistencies.

## 6.1 Configuration groups

[Curly Land Gen Z Social App UI by Faiz ur Rehman on Dribbble](https://images.openai.com/static-rsc-4/vMphkDca38R-4NnMvwauyV6GvwlCBMLZmYvaj0482p8YykIibG2jwK6CSniLFb-gVnfvfWRkL0LKsa73_nF7AldYWSodCckikqxfvaHpQaOsTrz5ieP-Bp3tktNlh8xSXcjJyGhVhYyWnd4cDQSv40h50EddUfGKcxstaqB4_m2e9ytVnOYdKmf9fYrj6tHU?purpose=fullsize)

Identity and branding

- Name, handle, description.
- Avatar and cover.
- Brand colors within accessible contrast limits.
- Introductory content.
- Welcome message and onboarding.

[Roles and Permissions in Heartbeat – Heartbeat](https://images.openai.com/static-rsc-4/XFzN-xOPi05nH1PETcN4kQm3IUd-4otBKfY9zHQHxkg0B1NWiAPlSv0mBbK3O5o85RVbMBPXAamZ3tG1nYNxwer47PywIAOIfGwGDG5YahJO6So3noVqiObuvf3ULpaNcIj-NS2B3exp2r5lQy8YEoQo07Ru73Cf2_eCCZjoEn4TyhKre0Yk8Gg_cW2yeS8K?purpose=fullsize)

Membership and access

- Public or private visibility.
- Join and invitation rules.
- Application questions.
- Member approval.
- Posting permissions.
- Restricted member policies.

[Community Engagement Platform for Connected Groups | inLynk](https://images.openai.com/static-rsc-4/2euQzNupUG6ZQNlzfPLxPPIiLN7GBIiL_3_Dwvwl08ddoMWE4TUTYZ44Xcf37rs9wtd_BnSj6rg39KDeCxho7jetnwWq-XuMH_YdOXbKGLmghCrjYqb2hfBP9dSM9YV1bH8LpKS7kMfrQUWVbw40zffljf4Ab-jbG_B9s6KV2YHi_tG7A-lDvDM1PuDT-6d1?purpose=fullsize)

Experience and navigation

- Community sections.
- Featured resources.
- Pinned links.
- Community-specific tabs.
- Content display preferences.
- Accessibility options.

[Automated Chat Moderation with AI-Powered Content Filter](https://images.openai.com/static-rsc-4/u2GcWDvq-iGucpY8oILRtedWhAs0XT8jOP2sIIme9cdGOtQ12OC3DHEMaWww5uvQdqkrQE58OEqA5pui1GC7-Y55y9IaSP-TWINF5CYoWCBTEzNyiuPBjf20s0C2tpajR5xEn2AsRuULcdKRqQDM95_CY9OlRQVUG4u_k7IlBMIABjEYlbVoaopCy2d-MXrT?purpose=fullsize)

Safety and discovery

- Moderation settings.
- Content review requirements.
- Search indexing preferences.
- Recommendation eligibility.
- External link policies.
- Advertising eligibility.

### Configuration requirements

Every configuration update must:

1. Authenticate the requesting user.
2. Verify their current permission.
3. Validate all fields against the configuration schema.
4. Apply platform and privacy restrictions.
5. Record an audit event.
6. Update the community version.
7. Publish relevant configuration-change events.
8. Invalidate affected caches.
9. Re-evaluate dependent workflows when needed.

For high-impact configuration changes, require reauthentication or additional approval.

# 7. Membership management and role-based access

This module is foundational because almost every community feature depends on the identity, role and current membership state of the user.

## 7.1 Membership lifecycle

\#chatgpt-mermaid-\_r_3q4\_{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;fill:rgb(13, 13, 13);}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-\_r_3q4\_ .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_3q4\_ .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_3q4\_ .error-icon{fill:rgb(255, 255, 255);}#chatgpt-mermaid-\_r_3q4\_ .error-text{fill:rgb(13, 13, 13);stroke:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3q4\_ .edge-thickness-normal{stroke-width:1px;}#chatgpt-mermaid-\_r_3q4\_ .edge-thickness-thick{stroke-width:3.5px;}#chatgpt-mermaid-\_r_3q4\_ .edge-pattern-solid{stroke-dasharray:0;}#chatgpt-mermaid-\_r_3q4\_ .edge-thickness-invisible{stroke-width:0;fill:none;}#chatgpt-mermaid-\_r_3q4\_ .edge-pattern-dashed{stroke-dasharray:3;}#chatgpt-mermaid-\_r_3q4\_ .edge-pattern-dotted{stroke-dasharray:2;}#chatgpt-mermaid-\_r_3q4\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3q4\_ .marker.cross{stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3q4\_ svg{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;}#chatgpt-mermaid-\_r_3q4\_ p{margin:0;}#chatgpt-mermaid-\_r_3q4\_ defs [id$="-barbEnd"]{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3q4\_ g.stateGroup text{fill:rgb(239, 139, 87);stroke:none;font-size:10px;}#chatgpt-mermaid-\_r_3q4\_ g.stateGroup text{fill:rgb(13, 13, 13);stroke:none;font-size:10px;}#chatgpt-mermaid-\_r_3q4\_ g.stateGroup .state-title{font-weight:bolder;fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3q4\_ g.stateGroup rect{fill:rgb(250, 232, 222);stroke:rgb(239, 139, 87);}#chatgpt-mermaid-\_r_3q4\_ g.stateGroup line{stroke:rgb(143, 143, 143);stroke-width:1;}#chatgpt-mermaid-\_r_3q4\_ .transition{stroke:rgb(143, 143, 143);stroke-width:1;fill:none;}#chatgpt-mermaid-\_r_3q4\_ .stateGroup .composit{fill:transparent;border-bottom:1px;}#chatgpt-mermaid-\_r_3q4\_ .stateGroup .alt-composit{fill:#e0e0e0;border-bottom:1px;}#chatgpt-mermaid-\_r_3q4\_ .state-note{stroke:rgb(248, 212, 93);fill:rgb(255, 255, 255);}#chatgpt-mermaid-\_r_3q4\_ .state-note text{fill:rgb(13, 13, 13);stroke:none;font-size:10px;}#chatgpt-mermaid-\_r_3q4\_ .stateLabel .box{stroke:none;stroke-width:0;fill:rgb(250, 232, 222);opacity:0.5;}#chatgpt-mermaid-\_r_3q4\_ .edgeLabel .label rect{fill:rgb(250, 232, 222);opacity:0.5;}#chatgpt-mermaid-\_r_3q4\_ .edgeLabel{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-\_r_3q4\_ .edgeLabel p{background-color:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_3q4\_ .edgeLabel rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_3q4\_ .edgeLabel .label text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3q4\_ .label div .edgeLabel{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3q4\_ .stateLabel text{fill:rgb(13, 13, 13);font-size:10px;font-weight:bold;}#chatgpt-mermaid-\_r_3q4\_ .node circle.state-start{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3q4\_ .node .fork-join{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3q4\_ .node circle.state-end{fill:rgb(239, 139, 87);stroke:transparent;stroke-width:1.5;}#chatgpt-mermaid-\_r_3q4\_ .end-state-inner{fill:transparent;stroke-width:1.5;}#chatgpt-mermaid-\_r_3q4\_ .node rect{fill:rgb(250, 232, 222);stroke:rgb(239, 139, 87);stroke-width:1px;}#chatgpt-mermaid-\_r_3q4\_ .node polygon{fill:rgb(250, 232, 222);stroke:rgb(239, 139, 87);stroke-width:1px;}#chatgpt-mermaid-\_r_3q4\_ [id$="-barbEnd"]{fill:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3q4\_ .statediagram-cluster rect{fill:rgb(250, 232, 222);stroke:rgb(239, 139, 87);stroke-width:1px;}#chatgpt-mermaid-\_r_3q4\_ .cluster-label,#chatgpt-mermaid-\_r_3q4\_ .nodeLabel{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3q4\_ .statediagram-cluster rect.outer{rx:5px;ry:5px;}#chatgpt-mermaid-\_r_3q4\_ .statediagram-state .divider{stroke:rgb(239, 139, 87);}#chatgpt-mermaid-\_r_3q4\_ .statediagram-state .title-state{rx:5px;ry:5px;}#chatgpt-mermaid-\_r_3q4\_ .statediagram-cluster.statediagram-cluster .inner{fill:transparent;}#chatgpt-mermaid-\_r_3q4\_ .statediagram-cluster.statediagram-cluster-alt .inner{fill:rgb(255, 255, 255);}#chatgpt-mermaid-\_r_3q4\_ .statediagram-cluster .inner{rx:0;ry:0;}#chatgpt-mermaid-\_r_3q4\_ .statediagram-state rect.basic{rx:5px;ry:5px;}#chatgpt-mermaid-\_r_3q4\_ .statediagram-state rect.divider{stroke-dasharray:10,10;fill:rgb(255, 255, 255);}#chatgpt-mermaid-\_r_3q4\_ .note-edge{stroke-dasharray:5;}#chatgpt-mermaid-\_r_3q4\_ .statediagram-note rect{fill:rgb(255, 255, 255);stroke:rgb(248, 212, 93);stroke-width:1px;rx:0;ry:0;}#chatgpt-mermaid-\_r_3q4\_ .statediagram-note rect{fill:rgb(255, 255, 255);stroke:rgb(248, 212, 93);stroke-width:1px;rx:0;ry:0;}#chatgpt-mermaid-\_r_3q4\_ .statediagram-note text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3q4\_ .statediagram-note .nodeLabel{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3q4\_ .statediagram .edgeLabel{color:red;}#chatgpt-mermaid-\_r_3q4\_ [id$="-dependencyStart"],#chatgpt-mermaid-\_r_3q4\_ [id$="-dependencyEnd"]{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);stroke-width:1;}#chatgpt-mermaid-\_r_3q4\_ .statediagramTitleText{text-anchor:middle;font-size:18px;fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3q4\_ [data-look="neo"].statediagram-cluster rect{fill:rgb(250, 232, 222);stroke:url(#chatgpt-mermaid-\_r_3q4\_-gradient);stroke-width:1;}#chatgpt-mermaid-\_r_3q4\_ [data-look="neo"].statediagram-cluster rect.outer{rx:5px;ry:5px;filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3q4\_ .node .neo-node{stroke:rgb(239, 139, 87);}#chatgpt-mermaid-\_r_3q4\_ [data-look="neo"].node rect,#chatgpt-mermaid-\_r_3q4\_ [data-look="neo"].cluster rect,#chatgpt-mermaid-\_r_3q4\_ [data-look="neo"].node polygon{stroke:url(#chatgpt-mermaid-\_r_3q4\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3q4\_ [data-look="neo"].swimlane.cluster rect{filter:none;}#chatgpt-mermaid-\_r_3q4\_ [data-look="neo"].node path{stroke:url(#chatgpt-mermaid-\_r_3q4\_-gradient);stroke-width:1px;}#chatgpt-mermaid-\_r_3q4\_ [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3q4\_ [data-look="neo"].node .neo-line path{stroke:rgb(239, 139, 87);filter:none;}#chatgpt-mermaid-\_r_3q4\_ [data-look="neo"].node circle{stroke:url(#chatgpt-mermaid-\_r_3q4\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3q4\_ [data-look="neo"].node circle .state-start{fill:#000000;}#chatgpt-mermaid-\_r_3q4\_ [data-look="neo"].icon-shape .icon{fill:url(#chatgpt-mermaid-\_r_3q4\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3q4\_ [data-look="neo"].icon-shape .icon-neo path{stroke:url(#chatgpt-mermaid-\_r_3q4\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3q4\_ :root{--mermaid-font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";}InvitedRequestedActiveExpiredRejectedRestrictedLeftRemovedOpen joinAcceptApproveRestoreReapply if allowedRejoin

These are membership states, not community lifecycle states. Keeping these independent prevents state combinations from becoming ambiguous.

## 7.2 Role hierarchy

| Role            | Typical permissions                                                   |
| --------------- | --------------------------------------------------------------------- |
| Owner           | Community-wide governance, ownership transfer and deletion initiation |
| Admin           | Configuration, membership management and delegated administration     |
| Moderator       | Content review, reports and enforcement within assigned scope         |
| Content manager | Announcements, featured content and editorial operations              |
| Event organizer | Event and schedule management                                         |
| Analyst         | Access to permitted aggregated insights                               |
| Member          | Participate and publish according to policy                           |
| Guest           | Limited access to eligible public or invitation-based content         |
| Agent           | Explicitly granted machine capabilities with restricted scope         |

The system should support custom roles, but custom roles must map to a permission registry. Do not allow role definitions to bypass protected operations.

## 7.3 Permission matrix

| Action                 | Owner    | Admin                | Moderator    | Content manager | Member            |
| ---------------------- | -------- | -------------------- | ------------ | --------------- | ----------------- |
| Edit community profile | Yes      | Yes                  | No           | Limited         | No                |
| Change join policy     | Yes      | Yes                  | No           | No              | No                |
| Approve members        | Yes      | Yes                  | Optional     | No              | No                |
| Remove members         | Yes      | Yes                  | Scoped       | No              | No                |
| Moderate content       | Yes      | Yes                  | Scoped       | Limited         | No                |
| Publish announcements  | Yes      | Yes                  | Optional     | Yes             | No                |
| Transfer ownership     | Yes      | No                   | No           | No              | No                |
| Delete community       | Initiate | Request if delegated | No           | No              | No                |
| View analytics         | Yes      | Yes                  | Safety scope | Content scope   | Own activity only |

Every permission must be checked on the server. Hiding a UI button is not an authorization mechanism.

## 7.4 Membership security

Additional requirements:

- Invitation expiry and revocation.
- Rate limits for invitations and join requests.
- Protection against invitation enumeration.
- Bulk-action safeguards.
- Member removal reason and audit.
- Membership history.
- Conflict-safe approval.
- Owner protection against accidental removal.
- Child and guardian policies where relevant.
- Privacy-aware member directory.
- Block and ban enforcement.
- Reapplication policy.
- Member export and privacy request support.

# 8. Ownership transfer and succession

Ownership transfer must be an explicit, audited workflow, not an ordinary role change.

\#chatgpt-mermaid-\_r_3qd\_{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;fill:rgb(13, 13, 13);}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-\_r_3qd\_ .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_3qd\_ .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_3qd\_ .error-icon{fill:rgb(255, 255, 255);}#chatgpt-mermaid-\_r_3qd\_ .error-text{fill:rgb(13, 13, 13);stroke:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3qd\_ .edge-thickness-normal{stroke-width:1px;}#chatgpt-mermaid-\_r_3qd\_ .edge-thickness-thick{stroke-width:3.5px;}#chatgpt-mermaid-\_r_3qd\_ .edge-pattern-solid{stroke-dasharray:0;}#chatgpt-mermaid-\_r_3qd\_ .edge-thickness-invisible{stroke-width:0;fill:none;}#chatgpt-mermaid-\_r_3qd\_ .edge-pattern-dashed{stroke-dasharray:3;}#chatgpt-mermaid-\_r_3qd\_ .edge-pattern-dotted{stroke-dasharray:2;}#chatgpt-mermaid-\_r_3qd\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3qd\_ .marker.cross{stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3qd\_ svg{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;}#chatgpt-mermaid-\_r_3qd\_ p{margin:0;}#chatgpt-mermaid-\_r_3qd\_ .label{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3qd\_ .cluster-label text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3qd\_ .cluster-label span{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3qd\_ .cluster-label span p{background-color:transparent;}#chatgpt-mermaid-\_r_3qd\_ .label text,#chatgpt-mermaid-\_r_3qd\_ span{fill:rgb(13, 13, 13);color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3qd\_ .node rect,#chatgpt-mermaid-\_r_3qd\_ .node circle,#chatgpt-mermaid-\_r_3qd\_ .node ellipse,#chatgpt-mermaid-\_r_3qd\_ .node polygon,#chatgpt-mermaid-\_r_3qd\_ .node path{fill:rgb(250, 232, 222);stroke:rgb(239, 139, 87);stroke-width:1px;}#chatgpt-mermaid-\_r_3qd\_ .rough-node .label text,#chatgpt-mermaid-\_r_3qd\_ .node .label text,#chatgpt-mermaid-\_r_3qd\_ .image-shape .label,#chatgpt-mermaid-\_r_3qd\_ .icon-shape .label{text-anchor:middle;}#chatgpt-mermaid-\_r_3qd\_ .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}#chatgpt-mermaid-\_r_3qd\_ .rough-node .label,#chatgpt-mermaid-\_r_3qd\_ .node .label,#chatgpt-mermaid-\_r_3qd\_ .image-shape .label,#chatgpt-mermaid-\_r_3qd\_ .icon-shape .label{text-align:center;}#chatgpt-mermaid-\_r_3qd\_ .node.clickable{cursor:pointer;}#chatgpt-mermaid-\_r_3qd\_ .root .anchor path{fill:rgb(143, 143, 143)!important;stroke-width:0;stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3qd\_ .arrowheadPath{fill:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3qd\_ .edgePath .path{stroke:rgb(143, 143, 143);stroke-width:1px;}#chatgpt-mermaid-\_r_3qd\_ .flowchart-link{stroke:rgb(143, 143, 143);fill:none;}#chatgpt-mermaid-\_r_3qd\_ .edgeLabel{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-\_r_3qd\_ .edgeLabel p{background-color:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_3qd\_ .edgeLabel rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_3qd\_ .labelBkg{background-color:rgba(252, 252, 252, 0.5);}#chatgpt-mermaid-\_r_3qd\_ .cluster rect{fill:rgb(255, 255, 255);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_3qd\_ .cluster text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3qd\_ .cluster span{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3qd\_ div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:12px;background:rgb(255, 255, 255);border:1px solid rgba(0, 0, 0, 0.1);border-radius:2px;pointer-events:none;z-index:100;}#chatgpt-mermaid-\_r_3qd\_ .flowchartTitleText{text-anchor:middle;font-size:18px;fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3qd\_ rect.text{fill:none;stroke-width:0;}#chatgpt-mermaid-\_r_3qd\_ .icon-shape,#chatgpt-mermaid-\_r_3qd\_ .image-shape{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-\_r_3qd\_ .icon-shape p,#chatgpt-mermaid-\_r_3qd\_ .image-shape p{background-color:rgb(252, 252, 252);padding:2px;}#chatgpt-mermaid-\_r_3qd\_ .icon-shape .label rect,#chatgpt-mermaid-\_r_3qd\_ .image-shape .label rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_3qd\_ .label-icon{display:inline-block;height:1em;overflow:visible;vertical-align:-0.125em;}#chatgpt-mermaid-\_r_3qd\_ .node .label-icon path{fill:currentColor;stroke:revert;stroke-width:revert;}#chatgpt-mermaid-\_r_3qd\_ .node .neo-node{stroke:rgb(239, 139, 87);}#chatgpt-mermaid-\_r_3qd\_ [data-look="neo"].node rect,#chatgpt-mermaid-\_r_3qd\_ [data-look="neo"].cluster rect,#chatgpt-mermaid-\_r_3qd\_ [data-look="neo"].node polygon{stroke:url(#chatgpt-mermaid-\_r_3qd\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3qd\_ [data-look="neo"].swimlane.cluster rect{filter:none;}#chatgpt-mermaid-\_r_3qd\_ [data-look="neo"].node path{stroke:url(#chatgpt-mermaid-\_r_3qd\_-gradient);stroke-width:1px;}#chatgpt-mermaid-\_r_3qd\_ [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3qd\_ [data-look="neo"].node .neo-line path{stroke:rgb(239, 139, 87);filter:none;}#chatgpt-mermaid-\_r_3qd\_ [data-look="neo"].node circle{stroke:url(#chatgpt-mermaid-\_r_3qd\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3qd\_ [data-look="neo"].node circle .state-start{fill:#000000;}#chatgpt-mermaid-\_r_3qd\_ [data-look="neo"].icon-shape .icon{fill:url(#chatgpt-mermaid-\_r_3qd\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3qd\_ [data-look="neo"].icon-shape .icon-neo path{stroke:url(#chatgpt-mermaid-\_r_3qd\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3qd\_ .node text{font-size:14px;font-weight:600;letter-spacing:normal;fill:rgb(109, 46, 15);}#chatgpt-mermaid-\_r_3qd\_ .edgeLabels text{font-size:13px;font-weight:600;letter-spacing:-0.08px;fill:rgb(109, 46, 15);}#chatgpt-mermaid-\_r_3qd\_ .node tspan[font-weight="normal"],#chatgpt-mermaid-\_r_3qd\_ .edgeLabels tspan[font-weight="normal"]{font-weight:600;}#chatgpt-mermaid-\_r_3qd\_ .edgeLabel .label rect{opacity:1;rx:13px;ry:13px;fill:rgb(255, 245, 240);stroke:rgb(229, 208, 195);stroke-width:1px;}#chatgpt-mermaid-\_r_3qd\_ .node rect,#chatgpt-mermaid-\_r_3qd\_ .node circle,#chatgpt-mermaid-\_r_3qd\_ .node ellipse,#chatgpt-mermaid-\_r_3qd\_ .node polygon,#chatgpt-mermaid-\_r_3qd\_ .node path{fill:rgb(255, 231, 217);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_3qd\_ .node rect{rx:16px;ry:16px;}#chatgpt-mermaid-\_r_3qd\_ .node.mermaid-decision .label-container{fill:rgb(255, 245, 240);stroke:rgb(229, 208, 195);stroke-dasharray:2,2;}#chatgpt-mermaid-\_r_3qd\_ .edgePaths .flowchart-link{stroke:rgb(143, 143, 143);stroke-width:1px;stroke-linecap:round;stroke-linejoin:round;}#chatgpt-mermaid-\_r_3qd\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3qd\_ :root{--mermaid-font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";}Current owner initiates transferSelect eligible successorValidate membership andeligibilitySend successor invitationSuccessor accepts?Revalidate permissions andstateAtomic ownership transferAudit, notify and update rolesCancel or expire requestYesNo

Requirements:

- Only eligible successors.
- Explicit consent from the successor.
- Reauthentication of the initiating owner.
- Time-limited transfer invitation.
- Cancellation before finalization.
- Concurrency control.
- Atomic role and ownership updates.
- Transfer history.
- Appropriate notification.
- Protection against transferring to suspended or restricted accounts.
- Defined handling for organizations and multiple authorized owners.
- Platform support process when the owner is unavailable.

The database transaction must prevent a temporary state with no valid owner or multiple unauthorized owners.

# 9. Announcements, pinned content and priority communication

Announcements are a distinct content type with governance metadata, delivery behavior and lifecycle.

## Announcement types

- General announcement.
- Urgent community notice.
- Event announcement.
- Policy change.
- Scheduled maintenance notice.
- New member welcome.
- Emergency or safety notification.

## Announcement lifecycle

```
Draft
  ↓
Review if required
  ↓
Scheduled or published
  ↓
Pinned or featured
  ↓
Expired, unpinned or archived
```

### Requirements

- Role-controlled publishing.
- Optional multi-person approval.
- Scheduling and timezone support.
- Pinning limits.
- Priority labels.
- Audience selection.
- Notification preferences.
- Edit history.
- Expiration.
- Delivery status.
- Translation support.
- Accessibility.
- Announcement analytics.
- Emergency-message authorization and safeguards.

An urgent announcement must not bypass notification consent or legal communication restrictions without a clearly defined, legitimate exception.

# 10. Community activity insights and analytics

Analytics must help owners understand the health and operation of their community without exposing individual members' private activity unnecessarily.

[Community Features](https://images.openai.com/static-rsc-4/xLhOn9FamXjN9YoKQho9QBr-aezMeaV7qt8KCcdIPzsY6CU60xuzj5wArkNgOtk_yhlEJ9Gsg0hvWx-wWu6WEEF12egpjv34eRLrzJImiRF0mr-UIb2Otr09WCdsfMO52k7G4pBBe1iiAm3NiABwI3ipq1GplScIkzN-XEfGNZM_fsUtUY1Bu3trDAXlZhI7?purpose=fullsize)

## 10.1 Analytics domains

| Domain        | Metrics                                                                   |
| ------------- | ------------------------------------------------------------------------- |
| Membership    | Total members, new members, pending requests, departures                  |
| Growth        | Net member growth, invitation conversion, join conversion                 |
| Engagement    | Active members, posts, comments, reactions, meaningful replies            |
| Content       | Post volume, content types, response time, content performance            |
| Retention     | Returning participants, cohort activity, churn                            |
| Discovery     | Community impressions, profile views, search discovery, conversion        |
| Events        | Registrations, attendance confirmations and participation                 |
| Announcements | Reach, reads, clicks, acknowledgment where appropriate                    |
| Moderation    | Reports, review backlog, action types, appeal outcomes                    |
| Safety        | Repeat violations, response time, abuse patterns                          |
| Advertising   | Eligible sponsored impressions and campaign-level results where permitted |

### Metric definitions

A metric must have a written definition, time period, grain, source and inclusion criteria.

For example:

```
Weekly Active Members

Definition:
Distinct eligible members with at least one qualifying
community interaction during a rolling or calendar week.

Excludes:
Automated system events, internal test accounts,
deleted events and unauthorized activity.

Dimensions:
Community, week, member cohort and interaction type.
```

Do not count every feed impression as meaningful engagement.

## 10.2 Analytics architecture

```
Domain Events
     ↓
Event Validation
     ↓
Privacy and Consent Filtering
     ↓
Analytics Pipeline
     ↓
Aggregated Data Store
     ↓
Metric Computation
     ↓
Owner Dashboard / Admin Reporting
```

Use event identifiers, schema versions, deduplication and delayed-event handling. Keep analytical aggregation separated from authoritative transactional records.

## 10.3 Privacy constraints

- No arbitrary owner access to member-level private analytics.
- Minimum cohort thresholds for sensitive breakdowns.
- Restricted access to moderation case details.
- No exposure of private message content in community analytics.
- Retention limits.
- Export controls.
- Audit logging for privileged analytics access.

Metrics should be used to understand activity, not to make unsupported claims about community quality or the intentions of its members.

# 11. Community localization and regional behavior

Localization needs to be supported at the data-model, API, moderation, search and frontend levels.

## 11.1 Localizable fields

- Community display name.
- Description.
- Welcome messages.
- Community rules.
- Announcements.
- Category labels.
- Event descriptions.
- Public resource metadata.
- Moderation templates.
- Notification templates.

Proposed model:

```
CommunityTranslation
 ├── community_id
 ├── locale
 ├── name
 ├── description
 ├── welcome_message
 ├── rules_version
 ├── translated_by
 ├── review_status
 └── updated_at
```

A community can have a canonical language and multiple translations. Translations must be traceable to their source version.

### Language-aware behavior

- Search by language.
- Language compatibility in discovery.
- User-selected translation preferences.
- Optional machine translation.
- Original-content display.
- Translation correction and feedback.
- Locale-aware date and number formats.
- Localized moderation workflows.
- Regional timezones for announcements and events.

AI translation should not silently change the authoritative wording of legal, privacy or safety rules.

# 12. Community lifecycle, archiving, restriction and deletion

The community lifecycle is a critical state machine. It must define which operations are possible in each state.

## 12.1 Proposed lifecycle

\#chatgpt-mermaid-\_r_3rh\_{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;fill:rgb(13, 13, 13);}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-\_r_3rh\_ .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_3rh\_ .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_3rh\_ .error-icon{fill:rgb(255, 255, 255);}#chatgpt-mermaid-\_r_3rh\_ .error-text{fill:rgb(13, 13, 13);stroke:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3rh\_ .edge-thickness-normal{stroke-width:1px;}#chatgpt-mermaid-\_r_3rh\_ .edge-thickness-thick{stroke-width:3.5px;}#chatgpt-mermaid-\_r_3rh\_ .edge-pattern-solid{stroke-dasharray:0;}#chatgpt-mermaid-\_r_3rh\_ .edge-thickness-invisible{stroke-width:0;fill:none;}#chatgpt-mermaid-\_r_3rh\_ .edge-pattern-dashed{stroke-dasharray:3;}#chatgpt-mermaid-\_r_3rh\_ .edge-pattern-dotted{stroke-dasharray:2;}#chatgpt-mermaid-\_r_3rh\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3rh\_ .marker.cross{stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3rh\_ svg{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;}#chatgpt-mermaid-\_r_3rh\_ p{margin:0;}#chatgpt-mermaid-\_r_3rh\_ defs [id$="-barbEnd"]{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3rh\_ g.stateGroup text{fill:rgb(239, 139, 87);stroke:none;font-size:10px;}#chatgpt-mermaid-\_r_3rh\_ g.stateGroup text{fill:rgb(13, 13, 13);stroke:none;font-size:10px;}#chatgpt-mermaid-\_r_3rh\_ g.stateGroup .state-title{font-weight:bolder;fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3rh\_ g.stateGroup rect{fill:rgb(250, 232, 222);stroke:rgb(239, 139, 87);}#chatgpt-mermaid-\_r_3rh\_ g.stateGroup line{stroke:rgb(143, 143, 143);stroke-width:1;}#chatgpt-mermaid-\_r_3rh\_ .transition{stroke:rgb(143, 143, 143);stroke-width:1;fill:none;}#chatgpt-mermaid-\_r_3rh\_ .stateGroup .composit{fill:transparent;border-bottom:1px;}#chatgpt-mermaid-\_r_3rh\_ .stateGroup .alt-composit{fill:#e0e0e0;border-bottom:1px;}#chatgpt-mermaid-\_r_3rh\_ .state-note{stroke:rgb(248, 212, 93);fill:rgb(255, 255, 255);}#chatgpt-mermaid-\_r_3rh\_ .state-note text{fill:rgb(13, 13, 13);stroke:none;font-size:10px;}#chatgpt-mermaid-\_r_3rh\_ .stateLabel .box{stroke:none;stroke-width:0;fill:rgb(250, 232, 222);opacity:0.5;}#chatgpt-mermaid-\_r_3rh\_ .edgeLabel .label rect{fill:rgb(250, 232, 222);opacity:0.5;}#chatgpt-mermaid-\_r_3rh\_ .edgeLabel{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-\_r_3rh\_ .edgeLabel p{background-color:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_3rh\_ .edgeLabel rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_3rh\_ .edgeLabel .label text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3rh\_ .label div .edgeLabel{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3rh\_ .stateLabel text{fill:rgb(13, 13, 13);font-size:10px;font-weight:bold;}#chatgpt-mermaid-\_r_3rh\_ .node circle.state-start{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3rh\_ .node .fork-join{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3rh\_ .node circle.state-end{fill:rgb(239, 139, 87);stroke:transparent;stroke-width:1.5;}#chatgpt-mermaid-\_r_3rh\_ .end-state-inner{fill:transparent;stroke-width:1.5;}#chatgpt-mermaid-\_r_3rh\_ .node rect{fill:rgb(250, 232, 222);stroke:rgb(239, 139, 87);stroke-width:1px;}#chatgpt-mermaid-\_r_3rh\_ .node polygon{fill:rgb(250, 232, 222);stroke:rgb(239, 139, 87);stroke-width:1px;}#chatgpt-mermaid-\_r_3rh\_ [id$="-barbEnd"]{fill:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3rh\_ .statediagram-cluster rect{fill:rgb(250, 232, 222);stroke:rgb(239, 139, 87);stroke-width:1px;}#chatgpt-mermaid-\_r_3rh\_ .cluster-label,#chatgpt-mermaid-\_r_3rh\_ .nodeLabel{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3rh\_ .statediagram-cluster rect.outer{rx:5px;ry:5px;}#chatgpt-mermaid-\_r_3rh\_ .statediagram-state .divider{stroke:rgb(239, 139, 87);}#chatgpt-mermaid-\_r_3rh\_ .statediagram-state .title-state{rx:5px;ry:5px;}#chatgpt-mermaid-\_r_3rh\_ .statediagram-cluster.statediagram-cluster .inner{fill:transparent;}#chatgpt-mermaid-\_r_3rh\_ .statediagram-cluster.statediagram-cluster-alt .inner{fill:rgb(255, 255, 255);}#chatgpt-mermaid-\_r_3rh\_ .statediagram-cluster .inner{rx:0;ry:0;}#chatgpt-mermaid-\_r_3rh\_ .statediagram-state rect.basic{rx:5px;ry:5px;}#chatgpt-mermaid-\_r_3rh\_ .statediagram-state rect.divider{stroke-dasharray:10,10;fill:rgb(255, 255, 255);}#chatgpt-mermaid-\_r_3rh\_ .note-edge{stroke-dasharray:5;}#chatgpt-mermaid-\_r_3rh\_ .statediagram-note rect{fill:rgb(255, 255, 255);stroke:rgb(248, 212, 93);stroke-width:1px;rx:0;ry:0;}#chatgpt-mermaid-\_r_3rh\_ .statediagram-note rect{fill:rgb(255, 255, 255);stroke:rgb(248, 212, 93);stroke-width:1px;rx:0;ry:0;}#chatgpt-mermaid-\_r_3rh\_ .statediagram-note text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3rh\_ .statediagram-note .nodeLabel{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3rh\_ .statediagram .edgeLabel{color:red;}#chatgpt-mermaid-\_r_3rh\_ [id$="-dependencyStart"],#chatgpt-mermaid-\_r_3rh\_ [id$="-dependencyEnd"]{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);stroke-width:1;}#chatgpt-mermaid-\_r_3rh\_ .statediagramTitleText{text-anchor:middle;font-size:18px;fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3rh\_ [data-look="neo"].statediagram-cluster rect{fill:rgb(250, 232, 222);stroke:url(#chatgpt-mermaid-\_r_3rh\_-gradient);stroke-width:1;}#chatgpt-mermaid-\_r_3rh\_ [data-look="neo"].statediagram-cluster rect.outer{rx:5px;ry:5px;filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3rh\_ .node .neo-node{stroke:rgb(239, 139, 87);}#chatgpt-mermaid-\_r_3rh\_ [data-look="neo"].node rect,#chatgpt-mermaid-\_r_3rh\_ [data-look="neo"].cluster rect,#chatgpt-mermaid-\_r_3rh\_ [data-look="neo"].node polygon{stroke:url(#chatgpt-mermaid-\_r_3rh\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3rh\_ [data-look="neo"].swimlane.cluster rect{filter:none;}#chatgpt-mermaid-\_r_3rh\_ [data-look="neo"].node path{stroke:url(#chatgpt-mermaid-\_r_3rh\_-gradient);stroke-width:1px;}#chatgpt-mermaid-\_r_3rh\_ [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3rh\_ [data-look="neo"].node .neo-line path{stroke:rgb(239, 139, 87);filter:none;}#chatgpt-mermaid-\_r_3rh\_ [data-look="neo"].node circle{stroke:url(#chatgpt-mermaid-\_r_3rh\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3rh\_ [data-look="neo"].node circle .state-start{fill:#000000;}#chatgpt-mermaid-\_r_3rh\_ [data-look="neo"].icon-shape .icon{fill:url(#chatgpt-mermaid-\_r_3rh\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3rh\_ [data-look="neo"].icon-shape .icon-neo path{stroke:url(#chatgpt-mermaid-\_r_3rh\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3rh\_ :root{--mermaid-font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";}DraftActiveRestrictedArchivedSuspendedDeletionPendingDeletedPublishGovernance actionRestoreOwner archivesAuthorized actionRestorePlatform enforcementEnforcementReinstateClose operationDeletion requestedDeletion requestedRecoveryRetention expires

The exact allowed transitions must be configured by the lifecycle policy. For example, a suspended community may require an administrative review before reactivation.

## 12.2 State behavior

| State            | Visibility                         | Publishing          | Membership          | Recovery                                              |
| ---------------- | ---------------------------------- | ------------------- | ------------------- | ----------------------------------------------------- |
| Draft            | Owner and authorized collaborators | Restricted          | Not open            | Editable                                              |
| Active           | Per visibility policy              | Allowed per role    | Normal              | Normal                                                |
| Restricted       | Limited according to reason        | Limited or disabled | Controlled          | Review-based                                          |
| Archived         | Usually non-discoverable           | Disabled by default | Read-only or closed | Authorized restore                                    |
| Suspended        | Limited or unavailable             | Disabled            | Restricted          | Formal review                                         |
| Deletion pending | Limited                            | Disabled            | Closed              | Time-limited recovery                                 |
| Deleted          | Not publicly accessible            | Disabled            | Closed              | Only through supported recovery procedure, if allowed |

## 12.3 Deletion workflow

```
Deletion Request
       ↓
Validate Authority
       ↓
Reauthentication
       ↓
Check Dependencies
       ↓
Display Consequences
       ↓
Enter Recovery Window
       ↓
Revoke Public Access
       ↓
Retention and Legal Review
       ↓
Delete Eligible Data
       ↓
Verify Completion
       ↓
Retain Only Lawfully Required Records
```

Important details:

- Distinguish deleting a community from deleting its owner account.
- Define treatment of member contributions.
- Define whether public content becomes unavailable or remains under a documented content-retention policy.
- Preserve only records with a legitimate retention basis.
- Respect privacy and data deletion obligations.
- Remove search indexes and invalidate caches.
- Delete or detach eligible media.
- Handle scheduled jobs, notifications and external integrations.
- Cancel campaigns and financial operations where applicable.
- Maintain a deletion audit record without unnecessarily retaining deleted personal data.

A deletion process should be asynchronous, idempotent and observable. It must not mark deletion as complete before the required downstream operations are verified.

# 13. Moderation, safety and appeals

Moderation is an operational system, not simply an automated classifier or a set of administrator buttons.

[How to Automate the DSA Transparency Report Template | Tremau](https://images.openai.com/static-rsc-4/indxHrMrRJOY6RolGWtZnzA21wnPRbgaLomx49LuOvUk-2rlfrVmR-t2a70WSTVoc9X9ah3KJJLjPdSOxirGRqZhwGfFpAijjsO5vJS2rpPkBDh7HIkBHnDkaENiJAx4rY6uR_91NGrWr6d4tA7Hp4ygS9Vz_bcmyyPAnLrNR-_sMWTTTmEH8EHh6dRS8fJI?purpose=fullsize)

## 13.1 Moderation components

```
Reports
 ├── Content reports
 ├── User reports
 ├── Community reports
 ├── Impersonation
 ├── Spam and scams
 └── Safety concerns

Moderation Operations
 ├── Intake
 ├── Prioritization
 ├── Automated signals
 ├── Human review
 ├── Enforcement
 ├── Notifications
 ├── Appeals
 ├── Quality review
 └── Audit
```

### Case lifecycle

```
Created
   ↓
Classified
   ↓
Prioritized
   ↓
Assigned
   ↓
Reviewed
   ↓
Decision
   ↓
Action and notification
   ↓
Appeal, if eligible
   ↓
Finalized
```

### Enforcement actions

- No action.
- Warning.
- Content label.
- Content removal.
- Content visibility restriction.
- Posting cooldown.
- Member restriction.
- Temporary suspension.
- Permanent removal.
- Community-level restriction.
- Platform escalation.

Each action needs a reason, scope, authorizing identity, duration where applicable and appeal policy.

### AI moderation

AI can assist with:

- Spam detection.
- Topic classification.
- Report prioritization.
- Duplicate case identification.
- Context summarization.
- Potential policy violation detection.
- Suggested review actions.

For high-impact or ambiguous actions, human review should be required according to a documented policy. AI should not independently expand its own permissions or override a human appeal decision.

### Moderation quality metrics

- Time to first review.
- Time to decision.
- Backlog.
- Reopened cases.
- Appeal rate.
- Appeal outcomes.
- Repeat reports.
- Reviewer consistency.
- False-positive and false-negative estimates.
- High-severity incident response.

These metrics should be interpreted with case severity and review context. A high report count alone is not proof of a community being unsafe.

# 14. Community events, shared planning and budgeting

Your project context also includes family and group coordination, festival planning and budget tracking. Those workflows should be integrated with community management without making the core community entity responsible for every event-specific detail.&#x20;

Pasted markdown.md



## Event capabilities

- Create an event.
- Invite members.
- Publish an event page.
- Set capacity.
- Manage registration.
- Schedule sessions.
- Assign tasks.
- Share files.
- Publish event announcements.
- Track attendance.
- Record expenses.
- Generate post-event summaries.

Proposed relationships:

```
Space
 ├── Events
 │    ├── EventParticipants
 │    ├── EventSessions
 │    ├── EventTasks
 │    ├── EventAnnouncements
 │    └── EventResources
 │
 └── Budgets
      ├── Expenses
      ├── Contributions
      ├── Approvals
      └── Settlements
```

For an early version, keep group budgeting as expense tracking and reporting. Actual payments, collections or financial settlement introduce substantially different legal, fraud, security and integration requirements.

# 15. Community AI agent and automation governance

The agent system described in your previous architecture must be treated as a governed participant with explicit scope and tool permissions. The existing project notes already establish that agents should not inherit unrestricted human administrator authority.&#x20;

Pasted markdown.md



## 15.1 Community agent capabilities

| Capability            | Example                            | Approval                                        |
| --------------------- | ---------------------------------- | ----------------------------------------------- |
| Summarization         | Weekly discussion summary          | Based on content-access permissions             |
| Topic discovery       | Suggest tags for new posts         | Human review where needed                       |
| Moderation assistance | Prioritize suspected spam          | Human decision for enforcement                  |
| Onboarding            | Explain community rules            | Configured content and access                   |
| Announcement drafting | Prepare a policy update            | Publisher approval                              |
| Activity insights     | Summarize aggregated engagement    | Analytics access control                        |
| Event planning        | Suggest schedules and tasks        | Approval for commitments                        |
| Translation           | Translate public community content | Review for important content                    |
| Member administration | Approve or remove members          | Explicit delegated authorization and safeguards |

## 15.2 Agent permission structure

```
Agent Identity
      ↓
Agent Scope
      ↓
Permission Registry
      ↓
Resource Authorization
      ↓
Tool Risk Evaluation
      ↓
Approval Policy
      ↓
Action Execution
      ↓
Audit and Evaluation
```

Each tool should define:

```
tool_id
version
input_schema
output_schema
resource_scope
permissions
risk_level
approval_policy
timeout
retry_policy
audit_policy
```

### Agent-specific safety requirements

- No unrestricted access to private conversations.
- No unauthorized member removal.
- No ownership transfers without a formally authorized workflow.
- No external disclosure of private information without the required authorization.
- No access to sensitive family or care data merely because the agent is associated with a community.
- Explicit limits on agent-generated messages.
- Tool-level idempotency.
- Approval expiry.
- Revocable agent access.
- Agent action history.
- Model and prompt version tracking.
- Safety evaluation and regression testing.

# 16. Community notifications and communication

A single notification service should support governance, social interaction and scheduled activity.

## Notification events

- Join request received.
- Invitation received.
- Invitation accepted.
- Membership approved or rejected.
- Member restricted or removed.
- Community policy updated.
- Announcement published.
- Event invitation.
- Event reminder.
- Ownership transfer request.
- Verification status change.
- Moderation decision.
- Appeal status change.
- Community deletion warning.
- Scheduled community report.

### Notification preferences

Users need controls for:

- Push.
- In-app notifications.
- Email.
- Optional additional channels.
- Per-community notification preferences.
- Announcement priority.
- Quiet hours.
- Frequency limits.
- Digest delivery.
- Muted communities.
- Security-critical communication.

### Delivery architecture

\#chatgpt-mermaid-\_r_3t5\_{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;fill:rgb(13, 13, 13);}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-\_r_3t5\_ .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_3t5\_ .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_3t5\_ .error-icon{fill:rgb(255, 255, 255);}#chatgpt-mermaid-\_r_3t5\_ .error-text{fill:rgb(13, 13, 13);stroke:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3t5\_ .edge-thickness-normal{stroke-width:1px;}#chatgpt-mermaid-\_r_3t5\_ .edge-thickness-thick{stroke-width:3.5px;}#chatgpt-mermaid-\_r_3t5\_ .edge-pattern-solid{stroke-dasharray:0;}#chatgpt-mermaid-\_r_3t5\_ .edge-thickness-invisible{stroke-width:0;fill:none;}#chatgpt-mermaid-\_r_3t5\_ .edge-pattern-dashed{stroke-dasharray:3;}#chatgpt-mermaid-\_r_3t5\_ .edge-pattern-dotted{stroke-dasharray:2;}#chatgpt-mermaid-\_r_3t5\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3t5\_ .marker.cross{stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3t5\_ svg{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;}#chatgpt-mermaid-\_r_3t5\_ p{margin:0;}#chatgpt-mermaid-\_r_3t5\_ .label{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3t5\_ .cluster-label text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3t5\_ .cluster-label span{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3t5\_ .cluster-label span p{background-color:transparent;}#chatgpt-mermaid-\_r_3t5\_ .label text,#chatgpt-mermaid-\_r_3t5\_ span{fill:rgb(13, 13, 13);color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3t5\_ .node rect,#chatgpt-mermaid-\_r_3t5\_ .node circle,#chatgpt-mermaid-\_r_3t5\_ .node ellipse,#chatgpt-mermaid-\_r_3t5\_ .node polygon,#chatgpt-mermaid-\_r_3t5\_ .node path{fill:rgb(250, 232, 222);stroke:rgb(239, 139, 87);stroke-width:1px;}#chatgpt-mermaid-\_r_3t5\_ .rough-node .label text,#chatgpt-mermaid-\_r_3t5\_ .node .label text,#chatgpt-mermaid-\_r_3t5\_ .image-shape .label,#chatgpt-mermaid-\_r_3t5\_ .icon-shape .label{text-anchor:middle;}#chatgpt-mermaid-\_r_3t5\_ .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}#chatgpt-mermaid-\_r_3t5\_ .rough-node .label,#chatgpt-mermaid-\_r_3t5\_ .node .label,#chatgpt-mermaid-\_r_3t5\_ .image-shape .label,#chatgpt-mermaid-\_r_3t5\_ .icon-shape .label{text-align:center;}#chatgpt-mermaid-\_r_3t5\_ .node.clickable{cursor:pointer;}#chatgpt-mermaid-\_r_3t5\_ .root .anchor path{fill:rgb(143, 143, 143)!important;stroke-width:0;stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3t5\_ .arrowheadPath{fill:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3t5\_ .edgePath .path{stroke:rgb(143, 143, 143);stroke-width:1px;}#chatgpt-mermaid-\_r_3t5\_ .flowchart-link{stroke:rgb(143, 143, 143);fill:none;}#chatgpt-mermaid-\_r_3t5\_ .edgeLabel{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-\_r_3t5\_ .edgeLabel p{background-color:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_3t5\_ .edgeLabel rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_3t5\_ .labelBkg{background-color:rgba(252, 252, 252, 0.5);}#chatgpt-mermaid-\_r_3t5\_ .cluster rect{fill:rgb(255, 255, 255);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_3t5\_ .cluster text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3t5\_ .cluster span{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3t5\_ div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:12px;background:rgb(255, 255, 255);border:1px solid rgba(0, 0, 0, 0.1);border-radius:2px;pointer-events:none;z-index:100;}#chatgpt-mermaid-\_r_3t5\_ .flowchartTitleText{text-anchor:middle;font-size:18px;fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3t5\_ rect.text{fill:none;stroke-width:0;}#chatgpt-mermaid-\_r_3t5\_ .icon-shape,#chatgpt-mermaid-\_r_3t5\_ .image-shape{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-\_r_3t5\_ .icon-shape p,#chatgpt-mermaid-\_r_3t5\_ .image-shape p{background-color:rgb(252, 252, 252);padding:2px;}#chatgpt-mermaid-\_r_3t5\_ .icon-shape .label rect,#chatgpt-mermaid-\_r_3t5\_ .image-shape .label rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_3t5\_ .label-icon{display:inline-block;height:1em;overflow:visible;vertical-align:-0.125em;}#chatgpt-mermaid-\_r_3t5\_ .node .label-icon path{fill:currentColor;stroke:revert;stroke-width:revert;}#chatgpt-mermaid-\_r_3t5\_ .node .neo-node{stroke:rgb(239, 139, 87);}#chatgpt-mermaid-\_r_3t5\_ [data-look="neo"].node rect,#chatgpt-mermaid-\_r_3t5\_ [data-look="neo"].cluster rect,#chatgpt-mermaid-\_r_3t5\_ [data-look="neo"].node polygon{stroke:url(#chatgpt-mermaid-\_r_3t5\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3t5\_ [data-look="neo"].swimlane.cluster rect{filter:none;}#chatgpt-mermaid-\_r_3t5\_ [data-look="neo"].node path{stroke:url(#chatgpt-mermaid-\_r_3t5\_-gradient);stroke-width:1px;}#chatgpt-mermaid-\_r_3t5\_ [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3t5\_ [data-look="neo"].node .neo-line path{stroke:rgb(239, 139, 87);filter:none;}#chatgpt-mermaid-\_r_3t5\_ [data-look="neo"].node circle{stroke:url(#chatgpt-mermaid-\_r_3t5\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3t5\_ [data-look="neo"].node circle .state-start{fill:#000000;}#chatgpt-mermaid-\_r_3t5\_ [data-look="neo"].icon-shape .icon{fill:url(#chatgpt-mermaid-\_r_3t5\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3t5\_ [data-look="neo"].icon-shape .icon-neo path{stroke:url(#chatgpt-mermaid-\_r_3t5\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3t5\_ .node text{font-size:14px;font-weight:600;letter-spacing:normal;fill:rgb(109, 46, 15);}#chatgpt-mermaid-\_r_3t5\_ .edgeLabels text{font-size:13px;font-weight:600;letter-spacing:-0.08px;fill:rgb(109, 46, 15);}#chatgpt-mermaid-\_r_3t5\_ .node tspan[font-weight="normal"],#chatgpt-mermaid-\_r_3t5\_ .edgeLabels tspan[font-weight="normal"]{font-weight:600;}#chatgpt-mermaid-\_r_3t5\_ .edgeLabel .label rect{opacity:1;rx:13px;ry:13px;fill:rgb(255, 245, 240);stroke:rgb(229, 208, 195);stroke-width:1px;}#chatgpt-mermaid-\_r_3t5\_ .node rect,#chatgpt-mermaid-\_r_3t5\_ .node circle,#chatgpt-mermaid-\_r_3t5\_ .node ellipse,#chatgpt-mermaid-\_r_3t5\_ .node polygon,#chatgpt-mermaid-\_r_3t5\_ .node path{fill:rgb(255, 231, 217);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_3t5\_ .node rect{rx:16px;ry:16px;}#chatgpt-mermaid-\_r_3t5\_ .node.mermaid-decision .label-container{fill:rgb(255, 245, 240);stroke:rgb(229, 208, 195);stroke-dasharray:2,2;}#chatgpt-mermaid-\_r_3t5\_ .edgePaths .flowchart-link{stroke:rgb(143, 143, 143);stroke-width:1px;stroke-linecap:round;stroke-linejoin:round;}#chatgpt-mermaid-\_r_3t5\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3t5\_ :root{--mermaid-font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";}Domain eventNotification policyUser preferences and consentTemplate and localeDelivery queueChannel adaptersProvider responseDelivery record and retry

The notification service should use deduplication keys, bounded retries, dead-letter handling and delivery observability.

# 17. Search, recommendation and community discovery

Search and discovery should be distinct services, as established in the previous project architecture notes.&#x20;

Pasted markdown.md



| Search                   | Discovery                       |
| ------------------------ | ------------------------------- |
| Responds to a query      | Surfaces useful candidates      |
| Exact and fuzzy matching | Relevance and diversity         |
| Filters and facets       | Personalized recommendations    |
| User-driven              | Feed and discovery-driven       |
| Search ranking           | Candidate ranking               |
| Query and result metrics | Impression and feedback metrics |

## Search capabilities

- Community name.
- Description.
- Category.
- Tags.
- Language.
- Region.
- Verified identity status.
- Public posts.
- Events.
- Public resource content.
- Typo tolerance.
- Synonyms.
- Filtering.
- Safe autocomplete.

Private spaces and private content must not leak through autocomplete, counts, search snippets, ranking features or caches.

## Discovery capabilities

- Interest-based community suggestions.
- Communities related to current memberships.
- Similar topic discovery.
- Local communities where permitted.
- New and emerging communities.
- Popular public communities.
- Events relevant to selected interests.
- Recommendations based on explicit feedback.

Diversity should be a documented ranking objective, with safeguards against repetitive recommendations and excessive concentration of exposure.

# 18. Complete database architecture and relationships

The following is a proposed logical data model. It is designed to support the unified Space model and the additional governance modules without coupling all domains into one enormous table.

\#chatgpt-mermaid-\_r_3tg\_{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;fill:rgb(13, 13, 13);}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-\_r_3tg\_ .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_3tg\_ .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_3tg\_ .error-icon{fill:rgb(255, 255, 255);}#chatgpt-mermaid-\_r_3tg\_ .error-text{fill:rgb(13, 13, 13);stroke:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3tg\_ .edge-thickness-normal{stroke-width:1px;}#chatgpt-mermaid-\_r_3tg\_ .edge-thickness-thick{stroke-width:3.5px;}#chatgpt-mermaid-\_r_3tg\_ .edge-pattern-solid{stroke-dasharray:0;}#chatgpt-mermaid-\_r_3tg\_ .edge-thickness-invisible{stroke-width:0;fill:none;}#chatgpt-mermaid-\_r_3tg\_ .edge-pattern-dashed{stroke-dasharray:3;}#chatgpt-mermaid-\_r_3tg\_ .edge-pattern-dotted{stroke-dasharray:2;}#chatgpt-mermaid-\_r_3tg\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3tg\_ .marker.cross{stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3tg\_ svg{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;}#chatgpt-mermaid-\_r_3tg\_ p{margin:0;}#chatgpt-mermaid-\_r_3tg\_ .entityBox{fill:rgb(250, 232, 222);stroke:rgb(239, 139, 87);}#chatgpt-mermaid-\_r_3tg\_ .relationshipLabelBox{fill:rgb(255, 255, 255);opacity:0.7;background-color:rgb(255, 255, 255);}#chatgpt-mermaid-\_r_3tg\_ .relationshipLabelBox rect{opacity:0.5;}#chatgpt-mermaid-\_r_3tg\_ .labelBkg{background-color:rgba(255, 255, 255, 0.5);}#chatgpt-mermaid-\_r_3tg\_ .edgeLabel{background-color:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_3tg\_ .edgeLabel .label rect{fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_3tg\_ .edgeLabel .label text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3tg\_ .edgeLabel .label{fill:rgb(239, 139, 87);font-size:14px;}#chatgpt-mermaid-\_r_3tg\_ .label{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3tg\_ .edge-pattern-dashed{stroke-dasharray:8,8;}#chatgpt-mermaid-\_r_3tg\_ .node rect,#chatgpt-mermaid-\_r_3tg\_ .node circle,#chatgpt-mermaid-\_r_3tg\_ .node ellipse,#chatgpt-mermaid-\_r_3tg\_ .node polygon{fill:rgb(250, 232, 222);stroke:rgb(239, 139, 87);stroke-width:1px;}#chatgpt-mermaid-\_r_3tg\_ .relationshipLine{stroke:rgb(143, 143, 143);stroke-width:1px;fill:none;}#chatgpt-mermaid-\_r_3tg\_ .marker{fill:none!important;stroke:rgb(143, 143, 143)!important;stroke-width:1;}#chatgpt-mermaid-\_r_3tg\_ [data-look=neo].labelBkg{background-color:rgba(255, 255, 255, 0.5);}#chatgpt-mermaid-\_r_3tg\_ .node .neo-node{stroke:rgb(239, 139, 87);}#chatgpt-mermaid-\_r_3tg\_ [data-look="neo"].node rect,#chatgpt-mermaid-\_r_3tg\_ [data-look="neo"].cluster rect,#chatgpt-mermaid-\_r_3tg\_ [data-look="neo"].node polygon{stroke:url(#chatgpt-mermaid-\_r_3tg\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3tg\_ [data-look="neo"].swimlane.cluster rect{filter:none;}#chatgpt-mermaid-\_r_3tg\_ [data-look="neo"].node path{stroke:url(#chatgpt-mermaid-\_r_3tg\_-gradient);stroke-width:1px;}#chatgpt-mermaid-\_r_3tg\_ [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3tg\_ [data-look="neo"].node .neo-line path{stroke:rgb(239, 139, 87);filter:none;}#chatgpt-mermaid-\_r_3tg\_ [data-look="neo"].node circle{stroke:url(#chatgpt-mermaid-\_r_3tg\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3tg\_ [data-look="neo"].node circle .state-start{fill:#000000;}#chatgpt-mermaid-\_r_3tg\_ [data-look="neo"].icon-shape .icon{fill:url(#chatgpt-mermaid-\_r_3tg\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3tg\_ [data-look="neo"].icon-shape .icon-neo path{stroke:url(#chatgpt-mermaid-\_r_3tg\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3tg\_ :root{--mermaid-font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";}USERSSPACESCOMMUNITIESSPACE_MEMBERSCOMMUNITY_POLICIESCOMMUNITY_CATEGORIESCATEGORIESCOMMUNITY_TAGSTAGSANNOUNCEMENTSPOSTSEVENTSMODERATION_CASESVERIFICATION_REQUESTSCOMMUNITY_ANALYTICSOWNERSHIP_TRANSFERSAUDIT_LOGScreatesconfigureshasjoinsdefinesclassifiedassignedtaggedappliedpublishesauthorscontainscreateshostsreceivesreportsverifiessubmitsaggregatesmanagesrecords

This ERD shows the major relationships, not every table or cardinality constraint.

## 18.1 Suggested table inventory

| Domain                  | Tables                                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------------------------- |
| Foundation              | `users`, `spaces`, `communities`, `space_settings`                                                        |
| Identity and membership | `space_members`, `space_roles`, `role_permissions`, `space_invitations`, `join_requests`                  |
| Taxonomy                | `categories`, `category_translations`, `tags`, `community_categories`, `community_tags`, `user_interests` |
| Rules                   | `community_policies`, `policy_versions`, `policy_rules`, `policy_evaluations`                             |
| Verification            | `verification_requests`, `verification_evidence`, `verification_reviews`, `verification_history`          |
| Customization           | `community_branding`, `community_navigation`, `community_feature_flags`                                   |
| Ownership               | `ownership_transfers`, `ownership_history`, `succession_policies`                                         |
| Announcements           | `announcements`, `announcement_audiences`, `announcement_deliveries`                                      |
| Lifecycle               | `lifecycle_transitions`, `deletion_requests`, `recovery_requests`                                         |
| Content                 | `posts`, `post_media`, `comments`, `reactions`, `content_visibility`                                      |
| News                    | `news_sources`, `news_articles`, `news_topics`, `news_ingestion_runs`                                     |
| Advertising             | `advertisers`, `ad_campaigns`, `ad_creatives`, `ad_placements`, `ad_events`                               |
| Moderation              | `reports`, `moderation_cases`, `moderation_actions`, `appeals`                                            |
| Analytics               | `analytics_events`, `community_metrics_daily`, `community_metrics_cohorts`                                |
| Localization            | `community_translations`, `translation_reviews`                                                           |
| Discovery               | `discovery_candidates`, `recommendation_feedback`, `search_documents`                                     |
| Events                  | `events`, `event_participants`, `event_tasks`, `event_sessions`                                           |
| Agents                  | `agents`, `agent_scopes`, `agent_permissions`, `agent_runs`, `agent_approvals`                            |
| Notifications           | `notifications`, `notification_deliveries`, `notification_preferences`                                    |
| Operations              | `outbox_events`, `audit_logs`, `idempotency_keys`, `deletion_jobs`                                        |

## 18.2 Key relationship rules

- One Space can have one applicable community configuration where the Space type supports it.
- One Space can have many members, roles, posts, policies and events.
- One user can be a member of multiple Spaces.
- One community can have multiple categories or tags.
- One announcement belongs to one Space and has an explicit audience.
- A moderation case can reference a Space and one or more related content records.
- An ownership transfer references the current owner, proposed successor and final outcome.
- Community metrics must be derived from permitted events and aggregation rules.
- A user interest must not automatically authorize access to private community content.
- Every important governance operation should reference the actor and the applicable policy version.

## 18.3 Database constraints and indexing

Recommended constraints:

```
-- Illustrative constraints; adapt to the final schema.

UNIQUE (space_id, user_id)
UNIQUE (space_id, slug)
UNIQUE (community_id, category_id)
UNIQUE (community_id, tag_id)
UNIQUE (community_id, locale)
```

Recommended indexing strategy:

- Membership lookup by `user_id` and `space_id`.
- Active community listing by `status`, `visibility` and category.
- Join requests by `community_id`, `status` and `created_at`.
- Announcements by `space_id`, `status` and `published_at`.
- Moderation cases by `queue_status`, `severity` and `created_at`.
- Audit history by `space_id`, `actor_id` and `occurred_at`.
- Lifecycle jobs by `status` and `scheduled_at`.
- News article deduplication by canonical URL or normalized content hash.

Use partial indexes for frequently queried active records and partition large append-only event or audit tables where justified by actual load and retention requirements.

# 19. API contracts and backend module boundaries

The API should use consistent authentication, authorization, pagination, validation and error contracts.

## 19.1 REST endpoint map

| Module        | Endpoint                                        | Purpose                        |
| ------------- | ----------------------------------------------- | ------------------------------ |
| Community     | `POST /v1/communities`                          | Create community               |
| Community     | `GET /v1/communities/{id}`                      | Retrieve eligible community    |
| Community     | `PATCH /v1/communities/{id}`                    | Update configuration           |
| Community     | `GET /v1/communities`                           | Search and list                |
| Categories    | `GET /v1/categories`                            | Browse taxonomy                |
| Tags          | `GET /v1/tags/suggest`                          | Suggest tags                   |
| Membership    | `POST /v1/communities/{id}/join`                | Request or perform join        |
| Membership    | `GET /v1/communities/{id}/members`              | List authorized members        |
| Membership    | `PATCH /v1/communities/{id}/members/{userId}`   | Manage membership              |
| Rules         | `GET /v1/communities/{id}/rules`                | Read current rules             |
| Rules         | `PUT /v1/communities/{id}/rules`                | Update rules                   |
| Verification  | `POST /v1/communities/{id}/verification`        | Submit verification            |
| Verification  | `GET /v1/communities/{id}/verification`         | Read permitted status          |
| Announcements | `POST /v1/communities/{id}/announcements`       | Create announcement            |
| Announcements | `GET /v1/communities/{id}/announcements`        | List announcements             |
| Analytics     | `GET /v1/communities/{id}/analytics`            | Retrieve authorized metrics    |
| Ownership     | `POST /v1/communities/{id}/ownership-transfers` | Start transfer                 |
| Lifecycle     | `POST /v1/communities/{id}/archive`             | Archive community              |
| Lifecycle     | `POST /v1/communities/{id}/deletion-requests`   | Request deletion               |
| Moderation    | `POST /v1/reports`                              | Report content or behavior     |
| Moderation    | `GET /v1/moderation/cases`                      | Access authorized review queue |
| Discovery     | `GET /v1/discovery/communities`                 | Retrieve recommendations       |
| Feed          | `GET /v1/feed`                                  | Retrieve eligible feed items   |

These endpoints are a design inventory. Final API paths, methods, status codes and request schemas should be confirmed against your actual backend conventions.

## 19.2 Common API requirements

Every endpoint must define:

- Authentication requirements.
- Permission requirements.
- Request and response schemas.
- Input limits.
- Error responses.
- Pagination behavior.
- Idempotency requirements.
- Rate limits.
- Audit requirements.
- Privacy classification.
- Versioning strategy.
- Observability fields.

Example error:

```
{
  "error": {
    "code": "COMMUNITY_PERMISSION_DENIED",
    "message": "You do not have permission to perform this action.",
    "request_id": "req_example"
  }
}
```

Use stable machine-readable error codes. Do not expose internal policy rules, private membership information or security-sensitive details in error messages.

# 20. Event-driven architecture and consistency

Community management has multiple asynchronous processes:

- Announcement notifications.
- Search indexing.
- Feed materialization.
- Analytics aggregation.
- Ownership transfer notifications.
- Community deletion.
- News ingestion.
- Moderation escalation.
- Recommendation updates.

These should use durable event processing.

\#chatgpt-mermaid-\_r_3u7\_{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;fill:rgb(13, 13, 13);}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-\_r_3u7\_ .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_3u7\_ .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_3u7\_ .error-icon{fill:rgb(255, 255, 255);}#chatgpt-mermaid-\_r_3u7\_ .error-text{fill:rgb(13, 13, 13);stroke:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3u7\_ .edge-thickness-normal{stroke-width:1px;}#chatgpt-mermaid-\_r_3u7\_ .edge-thickness-thick{stroke-width:3.5px;}#chatgpt-mermaid-\_r_3u7\_ .edge-pattern-solid{stroke-dasharray:0;}#chatgpt-mermaid-\_r_3u7\_ .edge-thickness-invisible{stroke-width:0;fill:none;}#chatgpt-mermaid-\_r_3u7\_ .edge-pattern-dashed{stroke-dasharray:3;}#chatgpt-mermaid-\_r_3u7\_ .edge-pattern-dotted{stroke-dasharray:2;}#chatgpt-mermaid-\_r_3u7\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3u7\_ .marker.cross{stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3u7\_ svg{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;}#chatgpt-mermaid-\_r_3u7\_ p{margin:0;}#chatgpt-mermaid-\_r_3u7\_ .label{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3u7\_ .cluster-label text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3u7\_ .cluster-label span{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3u7\_ .cluster-label span p{background-color:transparent;}#chatgpt-mermaid-\_r_3u7\_ .label text,#chatgpt-mermaid-\_r_3u7\_ span{fill:rgb(13, 13, 13);color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3u7\_ .node rect,#chatgpt-mermaid-\_r_3u7\_ .node circle,#chatgpt-mermaid-\_r_3u7\_ .node ellipse,#chatgpt-mermaid-\_r_3u7\_ .node polygon,#chatgpt-mermaid-\_r_3u7\_ .node path{fill:rgb(250, 232, 222);stroke:rgb(239, 139, 87);stroke-width:1px;}#chatgpt-mermaid-\_r_3u7\_ .rough-node .label text,#chatgpt-mermaid-\_r_3u7\_ .node .label text,#chatgpt-mermaid-\_r_3u7\_ .image-shape .label,#chatgpt-mermaid-\_r_3u7\_ .icon-shape .label{text-anchor:middle;}#chatgpt-mermaid-\_r_3u7\_ .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}#chatgpt-mermaid-\_r_3u7\_ .rough-node .label,#chatgpt-mermaid-\_r_3u7\_ .node .label,#chatgpt-mermaid-\_r_3u7\_ .image-shape .label,#chatgpt-mermaid-\_r_3u7\_ .icon-shape .label{text-align:center;}#chatgpt-mermaid-\_r_3u7\_ .node.clickable{cursor:pointer;}#chatgpt-mermaid-\_r_3u7\_ .root .anchor path{fill:rgb(143, 143, 143)!important;stroke-width:0;stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3u7\_ .arrowheadPath{fill:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3u7\_ .edgePath .path{stroke:rgb(143, 143, 143);stroke-width:1px;}#chatgpt-mermaid-\_r_3u7\_ .flowchart-link{stroke:rgb(143, 143, 143);fill:none;}#chatgpt-mermaid-\_r_3u7\_ .edgeLabel{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-\_r_3u7\_ .edgeLabel p{background-color:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_3u7\_ .edgeLabel rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_3u7\_ .labelBkg{background-color:rgba(252, 252, 252, 0.5);}#chatgpt-mermaid-\_r_3u7\_ .cluster rect{fill:rgb(255, 255, 255);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_3u7\_ .cluster text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3u7\_ .cluster span{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3u7\_ div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:12px;background:rgb(255, 255, 255);border:1px solid rgba(0, 0, 0, 0.1);border-radius:2px;pointer-events:none;z-index:100;}#chatgpt-mermaid-\_r_3u7\_ .flowchartTitleText{text-anchor:middle;font-size:18px;fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_3u7\_ rect.text{fill:none;stroke-width:0;}#chatgpt-mermaid-\_r_3u7\_ .icon-shape,#chatgpt-mermaid-\_r_3u7\_ .image-shape{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-\_r_3u7\_ .icon-shape p,#chatgpt-mermaid-\_r_3u7\_ .image-shape p{background-color:rgb(252, 252, 252);padding:2px;}#chatgpt-mermaid-\_r_3u7\_ .icon-shape .label rect,#chatgpt-mermaid-\_r_3u7\_ .image-shape .label rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_3u7\_ .label-icon{display:inline-block;height:1em;overflow:visible;vertical-align:-0.125em;}#chatgpt-mermaid-\_r_3u7\_ .node .label-icon path{fill:currentColor;stroke:revert;stroke-width:revert;}#chatgpt-mermaid-\_r_3u7\_ .node .neo-node{stroke:rgb(239, 139, 87);}#chatgpt-mermaid-\_r_3u7\_ [data-look="neo"].node rect,#chatgpt-mermaid-\_r_3u7\_ [data-look="neo"].cluster rect,#chatgpt-mermaid-\_r_3u7\_ [data-look="neo"].node polygon{stroke:url(#chatgpt-mermaid-\_r_3u7\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3u7\_ [data-look="neo"].swimlane.cluster rect{filter:none;}#chatgpt-mermaid-\_r_3u7\_ [data-look="neo"].node path{stroke:url(#chatgpt-mermaid-\_r_3u7\_-gradient);stroke-width:1px;}#chatgpt-mermaid-\_r_3u7\_ [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3u7\_ [data-look="neo"].node .neo-line path{stroke:rgb(239, 139, 87);filter:none;}#chatgpt-mermaid-\_r_3u7\_ [data-look="neo"].node circle{stroke:url(#chatgpt-mermaid-\_r_3u7\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3u7\_ [data-look="neo"].node circle .state-start{fill:#000000;}#chatgpt-mermaid-\_r_3u7\_ [data-look="neo"].icon-shape .icon{fill:url(#chatgpt-mermaid-\_r_3u7\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3u7\_ [data-look="neo"].icon-shape .icon-neo path{stroke:url(#chatgpt-mermaid-\_r_3u7\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_3u7\_ .node text{font-size:14px;font-weight:600;letter-spacing:normal;fill:rgb(109, 46, 15);}#chatgpt-mermaid-\_r_3u7\_ .edgeLabels text{font-size:13px;font-weight:600;letter-spacing:-0.08px;fill:rgb(109, 46, 15);}#chatgpt-mermaid-\_r_3u7\_ .node tspan[font-weight="normal"],#chatgpt-mermaid-\_r_3u7\_ .edgeLabels tspan[font-weight="normal"]{font-weight:600;}#chatgpt-mermaid-\_r_3u7\_ .edgeLabel .label rect{opacity:1;rx:13px;ry:13px;fill:rgb(255, 245, 240);stroke:rgb(229, 208, 195);stroke-width:1px;}#chatgpt-mermaid-\_r_3u7\_ .node rect,#chatgpt-mermaid-\_r_3u7\_ .node circle,#chatgpt-mermaid-\_r_3u7\_ .node ellipse,#chatgpt-mermaid-\_r_3u7\_ .node polygon,#chatgpt-mermaid-\_r_3u7\_ .node path{fill:rgb(255, 231, 217);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_3u7\_ .node rect{rx:16px;ry:16px;}#chatgpt-mermaid-\_r_3u7\_ .node.mermaid-decision .label-container{fill:rgb(255, 245, 240);stroke:rgb(229, 208, 195);stroke-dasharray:2,2;}#chatgpt-mermaid-\_r_3u7\_ .edgePaths .flowchart-link{stroke:rgb(143, 143, 143);stroke-width:1px;stroke-linecap:round;stroke-linejoin:round;}#chatgpt-mermaid-\_r_3u7\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_3u7\_ :root{--mermaid-font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";}API and domain servicesPostgreSQL transactionTransactional outboxOutbox publisherEvent busNotification consumersSearch and discoveryconsumersAnalytics consumersModeration and safetyconsumers

Example domain events:

```
SpaceCreated
CommunityActivated
CommunityPolicyUpdated
MemberJoined
MemberRestricted
AnnouncementPublished
VerificationApproved
OwnershipTransferStarted
OwnershipTransferred
CommunityArchived
CommunityDeletionRequested
CommunityDeleted
ModerationCaseCreated
NewsArticleIngested
AdCampaignApproved
```

### Reliability requirements

- Transactional outbox for critical state-change events.
- Idempotent consumers.
- Event schema versioning.
- Retry and dead-letter policies.
- Event replay procedures.
- Consumer lag monitoring.
- Reconciliation jobs.
- Distributed tracing.
- Explicit consistency guarantees.

Do not require all consumers to update before the main API returns. The response should clearly distinguish immediate transactional changes from asynchronous downstream work.

# 21. Complete UI/UX screen architecture

Community governance requires dedicated user-facing, owner-facing, moderator-facing and platform-administration experiences.

[Community Mobile App UI Design by Piyush Kalyan on Dribbble](https://images.openai.com/static-rsc-4/827YLRUGbAamoxnuZlgA4JhiUlSX5XsRE1Xa2GN5DBx_C_m4H5OhGSqSSFUCdNvWt_sTPUDqTiaa-gmQxn4BcVMLkw236yNSB8foDpc0-32Z8iOyqSmRRKbZzN0btrPzDENhp-X2R2TNvMHHsbQ1KmmOK1efHMXSBbMklka5dthEVU5djmqXEijkAEXWwoaq?purpose=fullsize)

A. User discovery and community experience

- Community directory.
- Category and interest explorer.
- Community profile.
- Join and invitation flow.
- Rules and guidelines.
- Community feed.
- Announcements.
- Events.
- Search and recommendations.
- Membership settings.

B. Owner and admin console

- Overview.
- Community settings.
- Roles and permissions.
- Join requests.
- Member management.
- Policy editor.
- Verification status.
- Announcement composer.
- Analytics.
- Lifecycle controls.
- Ownership transfer.

[How Reddit Could Level Up: A Product Roadmap for the Next Decade (part 2/2)](https://images.openai.com/static-rsc-4/CJhJvLPYVIWZKHNsNX1MljxcFs9WBInTLCIednzh_fkeTioAFSBdYIUuAk5QgZxq8x3hfNti-3Wntd6_7UjB94xPrY3zId21ueSvwSUHS4NZ6MZduMDbKuk0DLdlm5wddRL7lVdtWRD3IUz4Utzcs2X3lSIW3Rlge23BI_XmhDRXNXlgAUEwqUEQKKTEMeWi?purpose=fullsize)

C. Moderator workspace

- Report inbox.
- Priority queue.
- Content preview with appropriate access.
- Case history.
- Enforcement actions.
- Appeal management.
- Escalation.
- Moderator activity.

[8080.AI — Build with Scalable AI Agents](https://images.openai.com/static-rsc-4/5QgKQDeX6SDJJmbND2qjFjjQJrDvpHw2HiLiaGYFdPRMSAN914zV-q5-45hUCfoaWSK98UyfPVazntLrfgAtmACY80WUQsyyEK3oGILkQbjEF-g2dJZugQT1sQHVYni3lhByGPOf4XC_qhT55axJvCWtOtYmNFyiftrZW6uQQYoco3dBsC559hFB5Oy-ELOF?purpose=fullsize)

D. Platform administration

- Community directory and review.
- Verification operations.
- Global policy management.
- Taxonomy administration.
- Trust and safety operations.
- Advertising policy management.
- Suspension and appeals.
- Audit explorer.
- System health and queue monitoring.

## 21.1 Critical user flows

Community creation

```
Create community
      ↓
Choose type
      ↓
Enter identity and description
      ↓
Select category and tags
      ↓
Configure visibility and joining
      ↓
Set rules and permissions
      ↓
Preview
      ↓
Create draft or publish
      ↓
Onboarding and first announcement
```

Community onboarding

```
Discover
   ↓
Open profile
   ↓
Review rules and visibility
   ↓
Join or request access
   ↓
Complete any application questions
   ↓
Approval, if required
   ↓
Welcome and onboarding
   ↓
Select interests and notifications
```

Community policy update

```
Admin edits policy
       ↓
Validate policy
       ↓
Review impact
       ↓
Optional approval
       ↓
Publish new policy version
       ↓
Record audit event
       ↓
Notify affected users where required
       ↓
Apply new enforcement rules
```

Owner deletion request

```
Open lifecycle settings
       ↓
Request deletion
       ↓
Reauthenticate
       ↓
Review affected resources
       ↓
Confirm deletion request
       ↓
Notify relevant parties
       ↓
Begin recovery window
       ↓
Recover or finalize
       ↓
Verify downstream cleanup
```

# 22. Security, privacy and compliance

The governance system should follow a default-deny authorization model.

## Security controls

| Control               | Implementation requirement                                    |
| --------------------- | ------------------------------------------------------------- |
| Authentication        | Integrate with the platform's identity and session system     |
| Authorization         | RBAC plus resource and context checks                         |
| Tenant isolation      | Every applicable query scoped to the correct Space and tenant |
| API security          | Input validation, rate limiting and secure error handling     |
| Audit                 | Append-only security-sensitive operation history              |
| Encryption            | Appropriate transport and at-rest encryption                  |
| Secrets               | Centralized secrets management and rotation                   |
| File security         | Upload validation, malware scanning and access controls       |
| Session security      | Reauthentication for sensitive operations                     |
| Abuse protection      | Automated rate limits and suspicious activity detection       |
| Data protection       | Purpose limitation, minimization and retention controls       |
| Administrative access | Least privilege, access review and traceability               |

## Privacy classification

```
PUBLIC
GROUP_PRIVATE
PRIVATE
SENSITIVE
HIGHLY_SENSITIVE
SYSTEM
```

Every feature should declare the data it reads, writes, shares and retains.

For example:

- Public community posts can be eligible for public discovery.
- Family-group documents require explicit membership and document-level authorization.
- Private conversations must not become advertising targeting data.
- Moderation case details require dedicated permissions.
- Agent retrieval must enforce the same access policies as the original resource.
- Analytics exports should contain only authorized fields and aggregation levels.

## Regional and legal considerations

The platform should maintain a region-aware policy configuration for applicable requirements concerning privacy, children, user-generated content, advertising, data retention and platform operations.

For an India-focused deployment, applicable Indian privacy, intermediary, consumer protection and advertising requirements should be reviewed by qualified legal professionals before launch. A global deployment requires a separate regional compliance matrix.

# 23. Performance, reliability and observability

Governance systems must remain correct under concurrency, failures and high community activity.

## Reliability scenarios

| Failure                                    | Required behavior                                        |
| ------------------------------------------ | -------------------------------------------------------- |
| Owner transfer request is submitted twice  | Idempotent processing; no duplicate transfer             |
| Two admins edit rules concurrently         | Version conflict detection                               |
| Notification provider is unavailable       | Queue, retry and monitor delivery                        |
| Search indexing fails                      | Preserve authoritative database state and retry indexing |
| Community deletion worker crashes          | Resume safely using durable job state                    |
| Analytics events arrive late               | Reconcile aggregates                                     |
| Moderator acts on an already-resolved case | Conflict detection and clear response                    |
| Feed cache contains archived content       | Lifecycle-aware cache invalidation                       |
| AI agent calls an unauthorized tool        | Deny operation and record security event                 |
| Event bus consumer falls behind            | Monitor lag and apply backpressure                       |

## Suggested operational metrics

- API p50, p95 and p99 latency.
- Authorization denial rate.
- Failed membership transitions.
- Policy evaluation latency.
- Notification delivery latency.
- Queue depth and oldest-job age.
- Community deletion completion time.
- Search indexing lag.
- Feed candidate generation latency.
- Moderation backlog.
- Event consumer lag.
- Audit event persistence failures.

Set actual service-level objectives after workload assumptions, launch scope and production measurements are available.

# 24. Testing and quality assurance

Every module needs unit, integration, authorization, contract, load and end-to-end coverage where applicable.

## Test layers

| Layer         | Important scenarios                                                |
| ------------- | ------------------------------------------------------------------ |
| Unit          | Policy evaluation, lifecycle transitions, taxonomy validation      |
| Integration   | Membership, ownership, announcement and deletion transactions      |
| Authorization | Cross-Space access, role escalation and private resource isolation |
| Contract      | API schema and event compatibility                                 |
| Concurrency   | Duplicate requests, conflicting updates and ownership races        |
| Security      | Abuse attempts, privilege escalation, injection and IDOR           |
| Performance   | High-volume communities, feed generation and analytics queries     |
| Reliability   | Retries, worker restarts, provider failures and replay             |
| Accessibility | Keyboard navigation, screen readers and accessible forms           |
| UX            | Onboarding, settings, appeals and recovery flows                   |
| AI evaluation | Moderation assistance, summarization and agent permissions         |

## Mandatory governance test cases

1. A regular member cannot modify community rules.
2. A moderator cannot transfer ownership.
3. A community owner cannot bypass platform-wide restrictions.
4. A private community never appears in an unauthorized user's search results.
5. An expired invitation cannot be accepted.
6. A deleted community cannot receive new posts.
7. An archived community cannot receive new announcements unless explicitly permitted.
8. Ownership transfer cannot complete without successor consent.
9. Concurrent transfers cannot produce inconsistent ownership.
10. A moderator cannot access unrelated private Space content.
11. Community policy changes produce the correct policy version and audit event.
12. Analytics cannot reveal restricted individual-level activity.
13. A deletion workflow can recover within the configured recovery window.
14. A failed notification does not cause duplicate business operations.
15. An AI agent cannot exceed its explicit permissions.
16. Ad eligibility never bypasses user consent or protected-space restrictions.
17. News content retains its correct source attribution and review status.
18. A user can manage or reset the applicable personalization settings.

These tests should run in CI for relevant modules, with higher-cost load and resilience suites executed in scheduled or pre-release pipelines.

# 25. Developer teams and ownership boundaries

The project should be divided by domain ownership so that teams can build independently while following shared contracts.

| Team                            | Responsibility                       | Main deliverables                                       |
| ------------------------------- | ------------------------------------ | ------------------------------------------------------- |
| 1. Platform foundation          | Space and community core             | Domain model, community CRUD, configuration             |
| 2. Membership and IAM           | Membership, roles, permissions       | RBAC, join requests, invitations                        |
| 3. Taxonomy and discovery       | Categories, tags and recommendations | Taxonomy, search and discovery APIs                     |
| 4. Feed and content             | Posts and feed delivery              | Feed ranking, content eligibility and caching           |
| 5. News                         | External content ingestion           | Source registry, attribution and article indexing       |
| 6. Advertising                  | Campaigns and placements             | Campaign governance, consent and reporting              |
| 7. Trust and safety             | Moderation and verification          | Review queues, policies, appeals and trust workflows    |
| 8. Lifecycle and ownership      | Succession, archival and deletion    | State machines, transfer and recovery                   |
| 9. Analytics                    | Community insights                   | Event pipeline, metrics and dashboards                  |
| 10. Agent platform              | Community AI capabilities            | Agent scopes, tool registry and evaluation              |
| 11. Frontend                    | Web and Android experience           | User, admin and moderator interfaces                    |
| 12. Infrastructure and SRE      | Deployment and reliability           | CI/CD, monitoring, queues, backup and recovery          |
| 13. Security and privacy        | Cross-domain security                | Threat modeling, access controls and privacy reviews    |
| 14. QA and product verification | End-to-end quality                   | Test plans, acceptance testing and release verification |

Each team should own its APIs, database migrations, contracts, test suites, documentation and operational dashboards. Shared contracts should be reviewed before teams implement dependent features.

# 26. Dependency-aware implementation roadmap

The recommended order is based on architectural dependencies, not on feature popularity.

## Implementation roadmap

1. Phase 0 — Repository audit and product baseline

   Foundation
   - Inspect existing code and documentation.
   - Map the current Space and Community implementation.
   - Identify existing schemas, endpoints and tests.
   - Create the missing requirements inventory.
   - Record decisions and unresolved product questions.
   Deliverable: verified repository and requirements audit.
2. Phase 1 — Domain and authorization foundation
   - Define community and Space relationships.
   - Implement the core community model.
   - Establish membership lifecycle.
   - Define roles and permission registry.
   - Implement server-side authorization.
   - Add migrations and contract tests.
   Deliverable: secure community and membership foundation.
3. Phase 2 — Governance essentials
   - Community creation and customization.
   - Categories and tags.
   - Rules and policy versioning.
   - Member invitations and approvals.
   - Announcements.
   - Lifecycle controls.
   Deliverable: usable and governable communities.
4. Phase 3 — Ownership, verification and moderation
   - Ownership transfer.
   - Verification workflows.
   - Moderation queue.
   - Enforcement and appeals.
   - Archive, recovery and deletion.
   - Audit and administrative controls.
   Deliverable: operational governance and trust workflows.
5. Phase 4 — Discovery and content
   - Community directory.
   - Search and filtering.
   - User interest management.
   - Feed candidate generation.
   - Personalized recommendations.
   - Localization and regional discovery.
   Deliverable: interest-aware content discovery.
6. Phase 5 — News and advertising
   - News source management.
   - Ingestion and deduplication.
   - Article attribution.
   - Sponsored campaign configuration.
   - Ad eligibility and user preferences.
   - Advertising reporting and safety.
   Deliverable: governed news and monetization systems.
7. Phase 6 — Analytics and advanced agents
   - Event analytics pipeline.
   - Community activity dashboards.
   - Retention and cohort metrics.
   - AI assistance and tool permissions.
   - Agent safety and evaluation.
   - Automated reporting.
   Deliverable: measurable and assistive community operations.
8. Phase 7 — Production hardening and rollout
   - Security assessment.
   - Load and resilience testing.
   - Data migration validation.
   - Disaster recovery.
   - Observability and alerting.
   - Staged rollout and incident procedures.
   Deliverable: production release with measurable operational readiness.

Some phases can run in parallel once their interface contracts and dependencies are stable. In particular, frontend prototyping, taxonomy design and UX research can begin before every backend module is complete.

# 27. Product acceptance criteria

Use the following release gates for the complete community management system.

| Gate               | Acceptance condition                                                               |
| ------------------ | ---------------------------------------------------------------------------------- |
| Domain correctness | Space and Community models are consistent with the established project             |
| Authorization      | Protected operations enforce server-side permission checks                         |
| Membership         | Join, leave, invite, approve, restrict and remove workflows behave correctly       |
| Governance         | Policies are versioned, auditable and enforceable                                  |
| Verification       | Evidence, review, decision and appeal workflows are traceable                      |
| Ownership          | Transfer is atomic, consent-based and recoverable where applicable                 |
| Announcements      | Authorized publishing, scheduling and delivery behavior work end-to-end            |
| Lifecycle          | Archive, restriction, suspension, deletion and recovery follow defined transitions |
| Discovery          | Private content is excluded from unauthorized discovery                            |
| News               | Attribution, source validation and duplicate handling are correct                  |
| Advertising        | Consent, eligibility and privacy controls are enforced                             |
| Analytics          | Metric definitions are documented and access is restricted                         |
| Localization       | Localized content has reliable fallbacks and review states                         |
| Moderation         | Reports, enforcement, appeals and audit records work end-to-end                    |
| AI agents          | Tool permissions, approvals and private data access are enforced                   |
| Reliability        | Critical asynchronous operations can recover from failure                          |
| UX                 | Critical workflows are accessible and tested on supported devices                  |
| Operations         | Monitoring, alerting, backup and incident procedures are validated                 |

A feature is not complete because its screens exist or its API returns a successful response. Its full workflow, security boundaries, persistence behavior, error handling and acceptance tests must all be verified.

# 28. Important product decisions that remain open

The current project context establishes a broad vision but does not conclusively settle every product choice. These decisions should be documented before their respective implementations.

| Decision                                          | Why it matters                                 |
| ------------------------------------------------- | ---------------------------------------------- |
| Maximum number of categories per community        | Taxonomy design and search behavior            |
| Open versus approval-based membership defaults    | Onboarding and abuse prevention                |
| Community owner succession policy                 | Continuity and governance                      |
| Verification evidence standards                   | Trust and review operations                    |
| Feed ranking objectives                           | Personalization and content distribution       |
| News provider and content licensing model         | Legal and technical ingestion requirements     |
| Advertising business model                        | Campaign, billing and consent architecture     |
| Advertising in private Spaces                     | Privacy and monetization boundary              |
| Public community moderation responsibilities      | Division between owners and platform operators |
| Analytics retention and granularity               | Privacy and storage architecture               |
| Community deletion retention window               | Recovery and legal requirements                |
| AI moderation enforcement authority               | Safety and human oversight                     |
| Community translation authority                   | Accuracy and governance                        |
| Actual payment processing versus expense tracking | Financial, legal and security architecture     |
| Regional launch requirements                      | Localization, compliance and operations        |

These should be maintained in a product decisions register with an owner, status, rationale, affected modules and review date.

# 29. Engineering-agent execution instruction for your existing repository

The following is a standalone instruction you can provide to your GitHub Copilot or other repository-aware engineering agent. It is intended to turn the specification into an actual codebase assessment and implementation plan, rather than assuming that every module must be built from scratch.

# Mission: Complete Community Management and Governance System

You are the lead engineering agent responsible for evaluating and completing the Community Management and Governance domain of the existing community platform.

Your mission is to inspect the current repository, compare its implementation against the complete community management specification, identify missing functionality, create a dependency-aware implementation plan, and implement the approved work end-to-end.

## 1. Existing project constraints

This is an existing product with established architecture, requirements and implementation work.

You must:

- Inspect the complete relevant repository before implementation.
- Read existing product and architecture documentation.
- Reuse the existing unified Space model for public communities and private groups.
- Reuse existing identity, membership, authorization, content, messaging and notification infrastructure where appropriate.
- Avoid duplicate domain models and unnecessary services.
- Distinguish implemented, partially implemented, missing, defective and unverified functionality.
- Separate confirmed requirements from assumptions.
- Preserve existing valid behavior and architecture.
- Identify conflicts before proposing architectural changes.

Do not assume that a feature is missing merely because it is absent from a single screen or documentation file.

## 2. Required capability inventory

Inspect and map the existing implementation of:

1. Community creation and identity.
2. Community categories and subcategories.
3. Tags, interests and taxonomy management.
4. Community visibility and join policies.
5. Membership and invitation lifecycle.
6. Community roles and permissions.
7. Rules and policy evaluation.
8. Community verification.
9. Community customization.
10. Ownership transfer and succession.
11. Community deletion and recovery.
12. Activity insights and analytics.
13. Announcements and pinned content.
14. Community localization.
15. Lifecycle controls.
16. Content publishing and feed integration.
17. Interest-based discovery.
18. News integration and source attribution.
19. Advertising eligibility and monetization.
20. Moderation and appeals.
21. Event and group planning integration.
22. Community AI agent permissions.
23. Notifications and communication.
24. Search and recommendations.
25. Privacy, security and compliance controls.
26. Audit logs and operational observability.

For each capability, document:

- Existing implementation.
- Relevant files and modules.
- Database entities.
- API endpoints.
- UI screens.
- Permissions.
- Tests.
- Dependencies.
- Gaps.
- Risks.
- Recommended implementation.

## 3. Architecture requirements

Follow the repository's established architectural conventions.

Where applicable, ensure:

- Unified Space and Community domain modeling.
- Clear backend module boundaries.
- Server-side authorization.
- Transaction-safe governance operations.
- Explicit lifecycle state machines.
- Versioned policies.
- Typed configuration.
- Durable asynchronous event processing.
- Idempotent operations.
- Privacy-aware search and feed retrieval.
- Auditable privileged operations.
- Documented API and event contracts.
- Reusable web and Android integration patterns.

Do not introduce microservices, databases, message brokers or third-party services without a justified requirement.

## 4. Security and privacy

Perform threat analysis for:

- Privilege escalation.
- Cross-Space access.
- Unauthorized membership operations.
- Ownership transfer abuse.
- Verification fraud.
- Moderation abuse.
- Private-content exposure.
- Feed and search leakage.
- Ad-targeting misuse.
- Agent permission escalation.
- Deletion failures.
- Audit tampering.
- Invitation abuse.

Every sensitive operation must enforce appropriate authentication, authorization, validation, auditing and concurrency controls.

## 5. Interest-based content, news and advertising

Evaluate these as separate but connected domains.

Interest-based feeds must apply visibility and access restrictions before ranking.

News integration must provide source attribution, duplicate detection, licensing-aware ingestion, correction workflows and transparent AI-generated summaries.

Advertising must provide clear sponsored labeling, eligibility checks, consent-aware targeting, privacy restrictions, campaign review, budget controls and delivery reporting.

Private family, couple and solo Spaces must not become default sources for advertising or personalization data.

## 6. Implementation workflow

### Stage A: Audit

Do not change code initially.

Inspect the repository, document the current architecture, classify every capability and identify dependencies and implementation gaps.

Produce a traceable feature audit.

### Stage B: Planning

Create a dependency-aware roadmap.

Break each feature into tasks and subtasks with:

- Objective.
- Existing implementation.
- Scope.
- Dependencies.
- Affected modules.
- Database changes.
- API changes.
- Frontend and Android changes where applicable.
- Authorization and security requirements.
- Tests.
- Acceptance criteria.
- Risks.
- Definition of Done.

Separate foundational work from dependent features.

### Stage C: Review

Present the audit and proposed roadmap.

Identify decisions requiring product-owner approval. Make ordinary engineering decisions within the established project architecture, documenting the rationale.

Do not silently change established product requirements.

### Stage D: Implementation

After approval, execute dependency-ready tasks.

For each task:

1. Inspect existing code.
2. Implement the smallest complete production-ready change.
3. Add migrations and safe migration procedures where needed.
4. Implement API and UI integration.
5. Add authorization and validation.
6. Add error handling and observability.
7. Write unit and integration tests.
8. Run relevant test suites.
9. Run applicable security and performance checks.
10. Review the final diff.
11. Update documentation and task status.

Do not weaken tests, suppress errors or mark unverified work complete.

### Stage E: Verification

Run complete user and administrator workflows, including:

- Community creation.
- Joining and approval.
- Rule updates.
- Role changes.
- Announcements.
- Verification.
- Ownership transfer.
- Moderation and appeals.
- Archive and restoration.
- Deletion and recovery.
- Search and discovery.
- Feed eligibility.
- News ingestion.
- Advertising eligibility.
- Analytics access.
- Agent permissions.

Test negative cases, concurrency and failure recovery.

### Stage F: Completion

Produce a final implementation report containing:

- Features completed.
- Features partially completed.
- Features still missing.
- Files and modules changed.
- Database migrations.
- API changes.
- Tests executed and results.
- Security findings.
- Known limitations.
- Deployment requirements.
- Remaining product decisions.
- Next dependency-ready tasks.

Only mark work VERIFIED when its applicable acceptance criteria and Definition of Done are satisfied.

## 7. Definition of Done

A feature is complete only when its requirements, implementation, authorization, persistence, error handling, integration, tests, documentation and operational behavior have been verified.

Do not claim to have implemented or verified functionality that was not actually inspected or tested.

Begin with the repository audit. Do not start by generating a replacement architecture or rewriting existing code.

# 30. Final system view

## Community platform: end-to-end system architecture

\#chatgpt-mermaid-\_r_41d\_{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;fill:rgb(13, 13, 13);}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-\_r_41d\_ .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_41d\_ .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_41d\_ .error-icon{fill:rgb(255, 255, 255);}#chatgpt-mermaid-\_r_41d\_ .error-text{fill:rgb(13, 13, 13);stroke:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_41d\_ .edge-thickness-normal{stroke-width:1px;}#chatgpt-mermaid-\_r_41d\_ .edge-thickness-thick{stroke-width:3.5px;}#chatgpt-mermaid-\_r_41d\_ .edge-pattern-solid{stroke-dasharray:0;}#chatgpt-mermaid-\_r_41d\_ .edge-thickness-invisible{stroke-width:0;fill:none;}#chatgpt-mermaid-\_r_41d\_ .edge-pattern-dashed{stroke-dasharray:3;}#chatgpt-mermaid-\_r_41d\_ .edge-pattern-dotted{stroke-dasharray:2;}#chatgpt-mermaid-\_r_41d\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_41d\_ .marker.cross{stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_41d\_ svg{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;}#chatgpt-mermaid-\_r_41d\_ p{margin:0;}#chatgpt-mermaid-\_r_41d\_ .label{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_41d\_ .cluster-label text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_41d\_ .cluster-label span{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_41d\_ .cluster-label span p{background-color:transparent;}#chatgpt-mermaid-\_r_41d\_ .label text,#chatgpt-mermaid-\_r_41d\_ span{fill:rgb(13, 13, 13);color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_41d\_ .node rect,#chatgpt-mermaid-\_r_41d\_ .node circle,#chatgpt-mermaid-\_r_41d\_ .node ellipse,#chatgpt-mermaid-\_r_41d\_ .node polygon,#chatgpt-mermaid-\_r_41d\_ .node path{fill:rgb(250, 232, 222);stroke:rgb(239, 139, 87);stroke-width:1px;}#chatgpt-mermaid-\_r_41d\_ .rough-node .label text,#chatgpt-mermaid-\_r_41d\_ .node .label text,#chatgpt-mermaid-\_r_41d\_ .image-shape .label,#chatgpt-mermaid-\_r_41d\_ .icon-shape .label{text-anchor:middle;}#chatgpt-mermaid-\_r_41d\_ .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}#chatgpt-mermaid-\_r_41d\_ .rough-node .label,#chatgpt-mermaid-\_r_41d\_ .node .label,#chatgpt-mermaid-\_r_41d\_ .image-shape .label,#chatgpt-mermaid-\_r_41d\_ .icon-shape .label{text-align:center;}#chatgpt-mermaid-\_r_41d\_ .node.clickable{cursor:pointer;}#chatgpt-mermaid-\_r_41d\_ .root .anchor path{fill:rgb(143, 143, 143)!important;stroke-width:0;stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_41d\_ .arrowheadPath{fill:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_41d\_ .edgePath .path{stroke:rgb(143, 143, 143);stroke-width:1px;}#chatgpt-mermaid-\_r_41d\_ .flowchart-link{stroke:rgb(143, 143, 143);fill:none;}#chatgpt-mermaid-\_r_41d\_ .edgeLabel{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-\_r_41d\_ .edgeLabel p{background-color:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_41d\_ .edgeLabel rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_41d\_ .labelBkg{background-color:rgba(252, 252, 252, 0.5);}#chatgpt-mermaid-\_r_41d\_ .cluster rect{fill:rgb(255, 255, 255);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_41d\_ .cluster text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_41d\_ .cluster span{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_41d\_ div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:12px;background:rgb(255, 255, 255);border:1px solid rgba(0, 0, 0, 0.1);border-radius:2px;pointer-events:none;z-index:100;}#chatgpt-mermaid-\_r_41d\_ .flowchartTitleText{text-anchor:middle;font-size:18px;fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_41d\_ rect.text{fill:none;stroke-width:0;}#chatgpt-mermaid-\_r_41d\_ .icon-shape,#chatgpt-mermaid-\_r_41d\_ .image-shape{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-\_r_41d\_ .icon-shape p,#chatgpt-mermaid-\_r_41d\_ .image-shape p{background-color:rgb(252, 252, 252);padding:2px;}#chatgpt-mermaid-\_r_41d\_ .icon-shape .label rect,#chatgpt-mermaid-\_r_41d\_ .image-shape .label rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_41d\_ .label-icon{display:inline-block;height:1em;overflow:visible;vertical-align:-0.125em;}#chatgpt-mermaid-\_r_41d\_ .node .label-icon path{fill:currentColor;stroke:revert;stroke-width:revert;}#chatgpt-mermaid-\_r_41d\_ .node .neo-node{stroke:rgb(239, 139, 87);}#chatgpt-mermaid-\_r_41d\_ [data-look="neo"].node rect,#chatgpt-mermaid-\_r_41d\_ [data-look="neo"].cluster rect,#chatgpt-mermaid-\_r_41d\_ [data-look="neo"].node polygon{stroke:url(#chatgpt-mermaid-\_r_41d\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_41d\_ [data-look="neo"].swimlane.cluster rect{filter:none;}#chatgpt-mermaid-\_r_41d\_ [data-look="neo"].node path{stroke:url(#chatgpt-mermaid-\_r_41d\_-gradient);stroke-width:1px;}#chatgpt-mermaid-\_r_41d\_ [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_41d\_ [data-look="neo"].node .neo-line path{stroke:rgb(239, 139, 87);filter:none;}#chatgpt-mermaid-\_r_41d\_ [data-look="neo"].node circle{stroke:url(#chatgpt-mermaid-\_r_41d\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_41d\_ [data-look="neo"].node circle .state-start{fill:#000000;}#chatgpt-mermaid-\_r_41d\_ [data-look="neo"].icon-shape .icon{fill:url(#chatgpt-mermaid-\_r_41d\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_41d\_ [data-look="neo"].icon-shape .icon-neo path{stroke:url(#chatgpt-mermaid-\_r_41d\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_41d\_ .node text{font-size:14px;font-weight:600;letter-spacing:normal;fill:rgb(109, 46, 15);}#chatgpt-mermaid-\_r_41d\_ .edgeLabels text{font-size:13px;font-weight:600;letter-spacing:-0.08px;fill:rgb(109, 46, 15);}#chatgpt-mermaid-\_r_41d\_ .node tspan[font-weight="normal"],#chatgpt-mermaid-\_r_41d\_ .edgeLabels tspan[font-weight="normal"]{font-weight:600;}#chatgpt-mermaid-\_r_41d\_ .edgeLabel .label rect{opacity:1;rx:13px;ry:13px;fill:rgb(255, 245, 240);stroke:rgb(229, 208, 195);stroke-width:1px;}#chatgpt-mermaid-\_r_41d\_ .node rect,#chatgpt-mermaid-\_r_41d\_ .node circle,#chatgpt-mermaid-\_r_41d\_ .node ellipse,#chatgpt-mermaid-\_r_41d\_ .node polygon,#chatgpt-mermaid-\_r_41d\_ .node path{fill:rgb(255, 231, 217);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_41d\_ .node rect{rx:16px;ry:16px;}#chatgpt-mermaid-\_r_41d\_ .node.mermaid-decision .label-container{fill:rgb(255, 245, 240);stroke:rgb(229, 208, 195);stroke-dasharray:2,2;}#chatgpt-mermaid-\_r_41d\_ .edgePaths .flowchart-link{stroke:rgb(143, 143, 143);stroke-width:1px;stroke-linecap:round;stroke-linejoin:round;}#chatgpt-mermaid-\_r_41d\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_41d\_ :root{--mermaid-font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";}Web / Android / AdminAPI Gateway and IdentityUnified Space and CommunityCoreGovernance EngineContent and FeedSearch and DiscoveryNews IngestionAdvertisingTrust and ModerationAI Agent RuntimeEvent Bus and WorkersPostgreSQL / Redis / ObjectStorageAnalytics and InsightsObservability and Audit

Logical architecture. Actual deployment topology, service boundaries and technology choices should be aligned with the existing repository and measured workload.

The central architectural principle is to keep community identity, governance, content distribution, monetization, moderation and AI assistance as separate domains connected through explicit contracts and shared authorization.

This avoids several expensive classes of mistakes:

- Building multiple incompatible group systems.
- Giving moderators or agents broader permissions than intended.
- Mixing private and public discovery.
- Coupling advertising to sensitive personal data.
- Allowing deletion or ownership changes to leave orphaned resources.
- Using AI-generated decisions without appropriate governance.
- Reporting analytics that cannot be reconciled with underlying events.

The immediate engineering priority is to compare this specification against your actual repository and mark each capability as implemented, partial, missing or defective. That verified inventory should determine the implementation order rather than attempting to build every module simultaneously.