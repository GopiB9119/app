// Drafts written for a qualified lawyer's review (Product Research 2026-10-07, section 5.2). They describe what the
// code does today; every "[To complete before launch]" marks a fact the owner must supply. Not in force.
export const LEGAL_DRAFT_DATE = "2026-10-07";

const todo = "[To complete before launch]";

export function PrivacyNoticeDraft() {
  return <>
    <section>
      <h2>Who we are</h2>
      <p>Community Platform is a test version that runs with sample data only. Operator name, address and contact: {todo}.</p>
    </section>
    <section>
      <h2>What we keep</h2>
      <ul>
        <li><strong>Your account:</strong> email address, display name and time zone. Your password is kept only as a one-way protected hash. Your language choice is kept only in a cookie on your device.</li>
        <li><strong>Your sign-ins:</strong> the device name and platform you sign in from, and when. Each device can be signed out from your account.</li>
        <li><strong>What you create:</strong> Spaces, messages, tasks, events and replies to them, reminders, medicine instructions and notes, documents, budgets, public pages, posts, comments, likes, saves, follows, help requests and replies, and public event responses.</li>
        <li><strong>Your choices:</strong> interests, muted pages and topics, blocks and reports.</li>
        <li><strong>The assistant:</strong> what you ask it, its answers, the changes it proposed, what you approved, and notes you asked it to remember.</li>
        <li><strong>Sign-in protection:</strong> rate-limit identifiers and expiry times help limit repeated attempts. Hosting logs and their retention must also be reviewed before launch: {todo}.</li>
      </ul>
    </section>
    <section>
      <h2>How we use it</h2>
      <ul>
        <li>To run the features you use, and to keep accounts and communities safe.</li>
        <li>Your private Spaces, chats, tasks, calendars and medicine records are never used to suggest pages or posts, for search suggestions or for ads.</li>
        <li>Your chosen interests are used only to suggest public pages and posts to you, and you can clear them at any time.</li>
        <li>No advertising feature is implemented in this local preview. Advertising, analytics and data-sale policies for any future service need explicit review rather than being assumed from this draft.</li>
      </ul>
    </section>
    <section>
      <h2>Who else receives it</h2>
      <ul>
        <li><strong>People you share with:</strong> members of your Spaces, people in your chats, and the public for public pages, posts and events.</li>
        <li><strong>Moderators:</strong> page and platform moderators see content that was reported to them.</li>
        <li><strong>AI processing, when configured:</strong> the Microsoft Azure OpenAI integration can receive your request, display name, time zone, selected earlier requests and results from authorized tools. The Main Agent handles public content and your own memories; a Space Agent can use information you may access in that Space. Private in the app does not mean invisible to the server or its configured processor.</li>
        <li><strong>Web lookup, when configured:</strong> the TinyFish integration receives search words and page addresses chosen for a lookup. Do not include secrets or real personal details in this sample-data preview.</li>
        <li>Provider retention and training settings, deployment regions and processor contracts have not been established by this draft: {todo}. Integration code alone does not prove a provider is active.</li>
        <li><strong>Email delivery:</strong> this preview accepts synthetic .test addresses and captures registration and recovery codes in the local Mailpit inbox. It does not send them to your real email inbox. A production email provider is {todo}.</li>
        <li>Handling of lawful requests and any other disclosures needs an operator-approved policy and qualified legal review: {todo}.</li>
      </ul>
    </section>
    <section>
      <h2>How we protect it</h2>
      <ul>
        <li>Message bodies, medicine records and stored export archives use server-side encryption. They are not end-to-end encrypted: our server can read them. The downloaded file is not encrypted, so protect it on your device.</li>
        <li>Private-data operations use server-side account and access checks. Public pages are intentionally readable without signing in. These mechanisms and passing tests are not a security certification.</li>
        <li>The assistant normally requests an exact review before changing anything. If you choose opt-in auto-approve, eligible actions in that request can run without another confirmation. New public pages, publishing and comments still require review.</li>
      </ul>
    </section>
    <section>
      <h2>How long we keep it</h2>
      <ul>
        <li>Retention depends on the record type. A complete schedule for application records, operational logs and processors is {todo}.</li>
        <li>If you own a Space with other members, you must hand over ownership or remove those members before requesting account deletion.</li>
        <li>Once your deletion request is accepted, you have 7 days to cancel. After that a worker erases personal content and de-identifies retained shared records. This is not a promise to erase every copy: information already seen by others, backups and provider records need separate handling.</li>
        <li>A data download stays available for 24 hours.</li>
        <li>Backups: {todo}.</li>
      </ul>
    </section>
    <section>
      <h2>Your choices and rights</h2>
      <ul>
        <li>Export selected account data or request account deletion under Profile, Your data. Exports have category and history limits; inspect the archive notice for omissions rather than assuming it contains everything.</li>
        <li>See and take back what you have allowed under Profile, Privacy.</li>
        <li>Correct your name and time zone under Profile.</li>
        <li>Operator contact, request handling and response commitments are {todo}. Applicable rights and complaint routes, including the Data Protection Board of India where relevant, require legal review of jurisdiction and commencement dates. This draft does not certify compliance.</li>
      </ul>
    </section>
    <section>
      <h2>Children</h2>
      <p>This sample-data preview is not for anyone under 18. Age verification and guardian consent are not implemented. The permitted ages, jurisdiction and necessary safeguards for a real service are {todo}.</p>
    </section>
    <section>
      <h2>Changes to this notice</h2>
      <p>How notice changes will be communicated, versioned and approved before taking effect is {todo}.</p>
    </section>
  </>;
}

export function TermsDraft() {
  return <>
    <section>
      <h2>Who can use it</h2>
      <p>You must be 18 or older. This is a test version with sample data only; do not enter real personal, health or financial information.</p>
    </section>
    <section>
      <h2>Your content</h2>
      <p>What you create stays yours. You allow us to store it and show it to the people you share it with, only to run the service.</p>
    </section>
    <section>
      <h2>Community rules</h2>
      <ul>
        <li>No illegal content, harassment, hate, threats, scams, spam or pretending to be someone else.</li>
        <li>Respect other people&apos;s privacy: do not share their private information without permission.</li>
        <li>Follow each page&apos;s own rules.</li>
        <li>Moderators can hide content that breaks these rules. You will see the decision and can appeal once.</li>
      </ul>
    </section>
    <section>
      <h2>The assistant</h2>
      <ul>
        <li>The assistant can be wrong. Check important answers, especially news and prices.</li>
        <li>Changes normally require an exact review. If you choose opt-in auto-approve, eligible actions can run without another confirmation. New public pages, publishing and comments still require review.</li>
        <li>Do not rely on the assistant for medical, legal or financial advice, or assume an answer is correct because it includes a source.</li>
      </ul>
    </section>
    <section>
      <h2>Medicines</h2>
      <p>Medicine features only organize instructions you already have from a person or professional. They do not diagnose, prescribe or change doses, and they are not for emergencies. In an emergency, call your local emergency number.</p>
    </section>
    <section>
      <h2>Money</h2>
      <p>Budgets and contributions are records only. No payments are made in the app.</p>
    </section>
    <section>
      <h2>Ending</h2>
      <p>You can request account deletion under Profile, Your data. If you own a Space with other members, you must hand over ownership or remove those members first. Once your request is accepted, you have 7 days to cancel. Deletion is then processed by a worker; some shared records remain, and backups and provider copies need separate handling.</p>
      <p>We may limit or close an account that breaks these terms, and we will tell you why and how to appeal. {todo}</p>
    </section>
    <section>
      <h2>Availability and responsibility</h2>
      <p>This test version may change, stop or lose data. Limits of our responsibility: {todo}. Governing law and courts: {todo}.</p>
    </section>
  </>;
}
