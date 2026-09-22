// AI/ML Project Designer question bank - recovered verbatim from the old
// site's DB-seeded content (causalwizard.app/project/section/1..7), since
// the SQL dump excluded this table's data. See ROADMAP.md stage 8.5 for
// details on how this was recovered and what (a handful of illustrative
// images noted per-question) couldn't be.
//
// Single source of truth for both:
// - the static per-section "tips" pages (src/project/tips.njk, one
//   Eleventy-paginated template -> 7 pages, read-only, no duplication)
// - the interactive builder wizard (inlined as JSON into the page, see
//   src/project/builder.njk)
//
// `uid` (e.g. "1_1") matches the old site's exactly - it's what answers
// are keyed by in a Project record's `answers` map.

export default {
  sections: [
    {
      number: 1,
      navLabel: "Problem definition",
      title: "How to turn a problem into a Machine Learning solution",
      subtitle: "Answer the questions below to define the problem you will solve, and the impact of solving it.",
      builderIntro: "This section aims to focus and target the project.",
      questions: [
        {
          uid: "1_1",
          objective: "Background",
          prompt: "Briefly describe the <b>need</b>, <b>problem</b> or <b>opportunity</b> - from a business perspective, not a technical one.",
          moreInfo: `
            <p>The objective here is to define what you want to achieve, in terms which avoid narrowing how you will do it.</p>
            <p>You might have a business problem - something that is costing money or time (and time is money!) Or perhaps a new need, which must be met; or maybe you have spotted an opportunity to be seized.</p>
            <p>Ensure you capture the heart of the idea. Try to avoid creating a <a href="https://www.merriam-webster.com/dictionary/tautology" target="_blank">tautology</a> - for example, don't say "we need a machine which picks fruit, so this project is to develop a fruit-picking machine". Instead, focus on the real problem - "picking fruit by hand costs $XYZ per hectare and we believe there's an opportunity to reduce this cost using robotics". Avoid declaring the problem statement as a desired capability e.g. "this project will develop software to detect malware". Instead, re-focus on the problem "malware infections are costing the business $XYZ in lost productivity per person per month".</p>
            <p>To help you, ask stakeholders what their needs are, especially non-technical stakeholders. Try to define the problem or opportunity in their business language, not technical terms. The next question will also help you identify those stakeholders. If necessary, go and talk to them and come back to enhance your answer to this question.</p>`,
        },
        {
          uid: "1_2",
          objective: "Stakeholders and impact",
          prompt: "Which <b>teams</b>, <b>business functions</b> or <b>people</b> are likely to be <b>impacted</b> or <b>benefit</b> from the project?",
          moreInfo: `
            <p>The aim here is to start to understand who or what would potentially be affected by the project. This will help you build support and essential input for the project, and defuse any potential issues further down the track.</p>
            <p>To identify relevant entities, consider the project from several different perspectives.</p>
            <ul>
              <li>Which teams or individual people are potentially affected by the problem, or any future solution? Perhaps people are responsible for elements touched by the project, or even that entire business area. Or maybe the solution aims to change the workflow of these people, potentially making it easier or harder. Does it have implications for team size and jobs?</li>
              <li>Which business processes are potentially involved - either because they provide data or other input, or because they consume outputs of the project - or systems the project will replace?</li>
              <li>Finally, are there specific systems, equipment, apps, machines or devices which are affected, perhaps because the solution implies changes to their software environment. For example, if your solution will use a shared business app, you'll need to think about how that deployment and functionality would affect other users of the app and IT workloads.</li>
            </ul>`,
        },
        {
          uid: "1_3",
          objective: "Key domain knowledge",
          prompt: "Briefly name &amp; describe key <b>concepts</b>, <b>processes</b>, <b>risks</b> and <b>constraints</b> which are relevant to the project and might not be understood by all readers of this document.",
          moreInfo: `
            <p>This question aims to develop some key background knowledge to help your colleagues understand how your project fits into the bigger picture. This is the place to describe how your opportunity or problem fits into the business or system you're going to be changing. It's also the place to add key terminology or concepts which might not be familiar to everyone in your organisation. By providing this reference, you make it easier for them to understand everything else in this document.</p>
            <p>So what should you include?</p>
            <p>We suggest you start by thinking of the major concepts which relate to your solution - perhaps, the actions or entities in relevant workflows.</p>
            <p>Next, consider enumerating key steps or a diagram of the workflow or process flow involved. Consider listing essential inputs and dependencies.</p>
            <p>Another important consideration is risks - what are key business risks involved in the business function you're seeking to modify. Are these reputational? Financial? Legal?</p>
            <p>Finally, consider things which are constraining or limiting the existing process, and presumably impact any future solution as well.</p>
            <p>Don't make this section too long; the aim is to explain the high level picture.</p>`,
        },
      ],
    },
    {
      number: 2,
      navLabel: "Value proposition",
      title: "How to find a value-proposition for your AI project",
      subtitle: "Answer these questions to understand how your project and solution would deliver value - and how to measure it.",
      builderIntro:
        "This section will explore how delivering the project can provide value to the business. Try to visualize a <b>solution</b>: A specific response to the problem, need or opportunity. The project scope will typically cover one phase of solution development, often a Proof of Concept (PoC). To help you complete this document, it is helpful to <b>pretend the solution exists</b>, as much as you can imagine it. At this stage, it's OK if you don't have a clear picture <b>how</b> the solution would work. Assume it does.",
      questions: [
        {
          uid: "2_1",
          objective: "How will the project help the business?",
          prompt: "Explain what you want to achieve, and how this provides value to the business.",
          moreInfo: `
            <p>In the previous section, you outlined the problem or opportunity. Now it's time to think about what you could do to solve the problem, or grasp the opportunity.</p>
            <ul>
              <li>What are you trying to achieve?</li>
              <li>How will achieving this help your business?</li>
            </ul>
            <p>Don't stress about explaining the details of how you'll go about it. Focus on the outcomes or changes you want to make happen.</p>`,
        },
        {
          uid: "2_2",
          objective: "Address the Problem Statement",
          prompt: "Explain how the project will tackle the issues or opportunities described in the Problem Statement.",
          moreInfo: `
            <p>In this section, write a sentence or two explaining how achieving the changes or objectives outlined above will address the Problem Statement (the previous section of the project design).</p>
            <ul>
              <li>If your Statement is a problem, how are these changes expected to mitigate or solve the problem?</li>
              <li>If your Statement is an opportunity, how will the opportunity be grasped and exploited?</li>
              <li>If your Statement is a need, how will your solution meet that need?</li>
            </ul>`,
        },
        {
          uid: "2_3",
          objective: "Measuring value",
          prompt: "Describe how the value provided by the project can be demonstrated and measured objectively. Try to quantify this value.",
          moreInfo: `
            <p>A key weakness of many projects is the lack of a clear value proposition. This section is really important. How will the business generate a benefit or value from the project?</p>
            <p>This shouldn't be left to be self evident - "the value is we reduce network outages". The more explicit and specific you can be, the less the chance the value proposition will be forgotten, or never met.</p>
            <p>Look past the immediate objectives and talk to the original problem statement - for example, "network outages cause loss of vital data, which can't be recovered, and reduce productivity. By reducing the frequency of outages we can prevent data loss".</p>
            <p>By being specific, it's now easier to try to make the value proposition quantifiable and objectively measurable:</p>
            <p><i>"network outages typically occur every 200 hours, causing loss of vital data, which can't be recovered, and reduce productivity ( 15 staff spent an estimated XYZ hours last month repeating lost work at a cost of $50,000). We believe by addressing technical issues X and Y which are responsible for half the outages, we can halve the number of data-loss events and achieve labour savings of $25,000 a month. To achieve a one-year Return on Investment (ROI) just on labour savings, with a project investment of $125,000, 40% of network outages would need to be prevented."</i></p>
            <p>The quantifiable value proposition is hard to deny and provides a specific performance target for the project. It also provides a framework for amending the value-proposition if the project goes over budget, or if performance is less than anticipated.</p>
            <p>Try to avoid subjective measurements of value, such as opinions or views, or anecdotal comparative numbers. These will tend to shift around and can undermine you later. If you need to use subjective metrics (such as client satisfaction), make them more objective using surveys, ratings, or other statistical feedback.</p>`,
        },
        {
          uid: "2_4",
          objective: "Viability",
          prompt: "What level of impact, performance or gain is necessary for the project to deliver a financial benefit?",
          moreInfo: `
            <p>This question is less about giving an answer that's set in stone, than about creating a framework to calculate the financial cost/benefit of the project given changing solution performance metrics, or external factors such as changing user-base or number of customers.</p>
            <p>With this framework, you'll always be able to verify the financial viability of your project as it evolves. This will help to ensure your project has support within your organisation.</p>
            <p>It might help to focus first on relating solution performance to financial outcomes, and then scale those numbers. For example, try listing costs and benefits of each use of your solution, and then multiply this by the number of times it is applied each month.</p>
            <p>You may find that, for example, an automation project is only worthwhile if the error rate is less than 1%; or if it only defers 5% of samples for human review.</p>
            <p>You might find performance "cliffs" - thresholds, where below the magic value, the solution is unacceptable to customers, and anything above is fine. Consider how to detect if you're close to these thresholds and measure carefully. Are there ways to mitigate these cliffs by e.g. adding manual fallbacks or checks? How does this affect cost/benefit?</p>`,
        },
        {
          uid: "2_5",
          objective: "Potential risks",
          prompt: "Briefly identify key financial and reputational risks, business disruption, and change management issues that could arise from adoption of the solution.",
          moreInfo: `
            <p>Now that you've started to explore how the solution will address the problem, how it will provide value and the factors that determine whether the project will deliver an overall benefit or not, it's time to look at the risks involved. It's important to list all significant risks now - you're still in a position to do something about these risks!</p>
            <p>Risks can be financial - the solution could reduce revenue, or increase customer churn.</p>
            <p>Risks can also be reputational, which might be minor or potentially catastrophic.</p>
            <p>Explore both the likelihood and consequences of each risk. Risks which have catastrophic consequences must be addressed, even if the chances are small.</p>
            <p>Explicitly consider risks around solution performance, and what happens to the value proposition as performance declines.</p>
            <p>Usually, projects will have several more likely, but less consequential risks, such as disruption to other business activities, re-prioritization of key resources, and difficulties managing change. It is worth acknowledging these here, as a reminder to address these risks in project planning and management.</p>`,
        },
      ],
    },
    {
      number: 3,
      navLabel: "Build a team",
      title: "How to build an AI/ML project team",
      subtitle: "These questions will help you identify key team members and stakeholders who are vital to your success.",
      builderIntro: "This section will help you assemble the project team.",
      questions: [
        {
          uid: "3_1",
          objective: "Key stakeholders",
          prompt: "List teams, systems and individuals whose responsibilities will be affected by deployment of the solution.",
          moreInfo: `
            <p>The number of Stakeholders may be larger than your project team. You don't need to have them at every meeting - but you do need to work with them to ensure your project doesn't create problems for them. There's another question below which identifies key SMEs who will need to be regularly providing input to your project. The aim of this question is to produce a list of everyone and everything potentially affected by, or benefiting from, your solution.</p>
            <p><b>Teams</b> — Teams affected might be employees or customers who either consume solution outputs, will contribute to the operation or the solution, or use it directly. They might be a couple of steps "downstream" from the solution; or perhaps they are "upstream", and produce data used in the solution where new Quality Control processes will need to be applied. Usually you can find representatives of these teams to include in your stakeholder group.</p>
            <p><b>Systems</b> — Systems might be synonymous with some teams, but not always. There may be systems which are highly automated and used by many groups, which would have to consume outputs from your solution - presumably replacing existing outputs from the old solution or process. It's important to identify these systems affected to have a good understanding of the potential risks and consequences of deploying your solution.</p>
            <p><b>Individuals</b> — There may also be people who aren't directly going to use or be affected by data from your solution, but who are still affected by the risks or workload the solution will generate. For example - IT departments; Chief Information Officers (CIOs) - who are responsible for data security; Chief Technology Officers (CTOs) - because you're going to be introducing or using key new technologies and platforms; and support managers, because your deployment will change employee or user experience and generate new and potentially more numerous tickets!</p>`,
        },
        {
          uid: "3_2",
          objective: "Project Champion[s]",
          prompt: "Champions are crucial to maintaining project momentum and have a clear vision of the solution. Who is your Champion? Note: The champion is often also a stakeholder.",
          moreInfo: `
            <p>Simply list some candidate Champions in your response.</p>
            <p>We suggest that having an explicit champion for your project is very important. The Champion should be invested in your project to motivate them to keep pushing for its success. Often, this motivation is because the Champion is also a key stakeholder - but not always. They might simply be passionate about it. Either way, the Champion will be responsible for maintaining momentum.</p>
            <p>Another role of the Champion is maintaining a clear vision of the solution and the direction of the project. You might also call the Champion a Project Director, but the role is more activist than a normal director. There will be many choices and compromises to make; the Champion ensures that these choices don't lose track of the project value proposition.</p>
            <p>The Champion might also sponsor the project (giving it budget) but this is not always the case.</p>`,
        },
        {
          uid: "3_3",
          objective: "Subject matter experts (SMEs)",
          prompt: "SMEs know key data, systems, or business-processes better than almost anyone else. List SMEs whose knowledge and experience will be important to your project.",
          moreInfo: `
            <p>A good AI/ML project will usually cross many domains and disciplines. Typically, the experts in Business Analysis, Data Science, AI and ML won't know anything about the problem you're solving. That's where Subject Matter Experts (SMEs) come in.</p>
            <p>Usually, the SMEs won't know much about data science or ML. But that's OK - as long as the various experts talk to each other a lot!</p>
            <p>That's where having explicit SMEs on the project team comes in. SMEs should understand the problem or opportunity deeply. They should understand how existing processes work, their strengths and weaknesses, and the problems often encountered. They might also know about ideas that have been tried in the past, and failed. All this wisdom and experience will guide the project.</p>
            <p>The aim of this question is to identify a handful (at most) of SMEs who collectively really deeply understand the area the project is working in. They should be regularly involved in the project throughout its duration, helping to come up with ideas to solve problems and giving feedback on the quality of results. The SMEs will also help to identify data sources, and understand the characteristics of these data. Finally, SMEs will also know who or where to ask for additional information.</p>`,
        },
        {
          uid: "3_4",
          objective: "Team Composition",
          prompt: `Estimate the size and composition of the project team, including:
            <ul>
              <li>Project champion (from above)</li>
              <li>Project management role</li>
              <li>Selected hands-on Subject-Matter Experts (SMEs)</li>
              <li>Business analyst (BA) role</li>
              <li>Data science / AI / ML technical specialist role</li>
              <li>Software development / engineering role</li>
              <li>DevOps role</li>
              <li>Operations and technical support roles</li>
            </ul>
            <p>Note that in smaller projects, one person might fill multiple roles. Answering this question may require help from AI/ML and software development experts. That's OK - feel free to guess and refine the team later.</p>`,
          moreInfo: `
            <p>From experience, we can imagine some different teams of varying scale.</p>
            <p>A minimal team might be two individuals: 1 project manager/champion with deep SME knowledge; 1 AI/ML specialist with BA and software development skills. Like any good movie, there is always a protagonist who does things, and an antagonist who reviews and directs the work and understands the vision of where you need to get to. That separation is important to keep the project on a good track as the technical situation evolves.</p>
            <p>A small team for a PoC (Proof of Concept) without production delivery objectives might look like this: 1 project manager; 1 separate champion/SME; 1 business analyst; 1 AI/ML specialist with software development skills.</p>
            <p>Let's say you do want to carry the solution to production. A small team including development of production software might additionally have dedicated software engineering resource[s]: 1 project manager; 1 separate champion/SME; 1 business analyst; 1 AI/ML specialist with software development skills; 1 software engineer.</p>
            <p>If you require strong maintenance and support guarantees (e.g. Service-Level Agreements), you might want to add some hours or a resource for DevOps or technical support.</p>
            <p>Teams can grow much larger; it's not unusual for larger projects to occupy 10-20 people for months. But if you've got a team that big, you don't need to read this article - you'll have enough experience on tap.</p>
            <p><b>Mentoring</b> — One practice we often see on complex projects is a "senior" data-science/AI/ML specialist who reviews the work of a "junior" data-science/AI/ML practitioner or software engineer. It's important to have regular reviews of methodology both within and across disciplines. This helps to de-risk the project and it helps less experienced team members to grow.</p>`,
        },
      ],
    },
    {
      number: 4,
      navLabel: "Data",
      title: "Finding and preparing data for your AI/ML project",
      subtitle: "Consider the questions below to identify and explore data that will be needed in your project.",
      builderIntro:
        "This section will identify which data is needed, where it comes from, who maintains it, which version is most truthy and how data can be linked together. It is often helpful to answer these questions with someone who understands the concept of relational databases.",
      questions: [
        {
          uid: "4_1",
          objective: "Key sources",
          prompt: `List data which is necessary or highly desirable for the function or evaluation of the solution. In each case, make a note:
            <ul>
              <li>Who owns, controls or maintains the data?</li>
              <li>How much data is available (e.g. date ranges, number of samples)?</li>
              <li>Which version or source of the data is most definitive?</li>
            </ul>`,
          moreInfo: `
            <p>Reach out to colleagues to understand the data potentially available for use on the project. Try to think of all the key pieces you need and whether they contain the data needed to link them together.</p>
            <p>Do pay attention to the quality and quantity of data in each of these sources. You can express quantity in terms of the entities described in the data, or as transactions or date ranges stored (for example, "daily records since Dec 2005"). Quality can be captured in terms of completeness (how many fields or entries are blank) and consistency. Consistent data is typically generated according to a documented process, either by automation or software guided procedures. Ad-hoc collection of unstructured text is generally the least consistent and hardest to use in AI/ML projects (although this is changing with the advent of LLMs, which can exploit unstructured text).</p>
            <p>Note down who owns, maintain or control access to the data. They will need to be involved in your project. Facilitation and export of data in a convenient format is a huge assistance (and it can be quite time-consuming, with multiple iterations required). These people are often busy with other tasks, and may see your project as less important than day-to-day work.</p>
            <p>You will often encounter multiple versions of data used by different people or teams. Often, the provenance (origin story) of the data is poorly defined. It may be an undocumented, ad-hoc process. In these cases, you'll need to ensure that the data acquisition and storage process becomes documented and systematic as part of your project.</p>
            <p>To do this, first figure out which are the best sources of each key data file. Then, trace them back to the sources and engage the people who manage those sources. You may be able to build support for the project by delivering more accurate, reliable and timely data to others who rely on this data.</p>`,
        },
        {
          uid: "4_2",
          objective: "Data structure",
          prompt: "Explore with your team the structure of the data sources, and how they can be linked together, e.g. via unique identifiers or date ranges. List any potential issues with linking the data together, such as cardinality changes (e.g. many to 1 relations), gaps or missing data. Make notes here, and consider making an Entity-Relationship Diagram.",
          moreInfo: `
            <p><b>Relational databases</b> — Most databases are relational, which means they store tables of data, and the relationships (links) between these tables. However, most AI/ML methods assume that the data is a single table! Even if your data is stored in spreadsheets, you will probably also need to link these spreadsheets together.</p>
            <p>This means that there is usually a data transformation step in any AI/ML solution development in which multiple tables or data sources are joined together, and transformed into a single table or matrix (this is also known as denormalization). This step may be difficult, so it's worth exploring it now if you can.</p>
            <img src="/assets/images/denormalization_for_ml.png" alt="A tabular ML dataset combining Subscription status and Customer age, produced by joining two linked tables in a relational database" style="max-width:100%;" class="my-2" />
            <p>The figure above shows a tabular ML dataset which includes Subscription status and Customer age data, produced from two linked tables in a relational (SQL) database. The tables must be joined to produce the dataset. The number of rows in the two tables is probably different, creating cardinality changes that must be tackled.</p>
            <p><b>Cardinality</b> — Cardinality refers to the change in the number of records (or rows) between one data source or table and another. Cardinality changes are particularly problematic when trying to denormalize data sources or tables into an ML dataset, because the gaps or duplicates in the resulting table are problematic for ML and AI methods (and also problematic for evaluation of the solution). Where possible, it is preferable to define rules which collapse duplicates into a single record, and explicitly create evaluation methods which consider the non-independence of linked samples.</p>
            <p><b>Other types of database</b> — There are other types of data and database you might encounter, which have their own issues.</p>
            <ul>
              <li>Timeseries data is typically large, although the structure is usually simpler. However, you will often have to join this data to less dynamic, relational data.</li>
              <li>Graph databases typically have data-defined structure making the denormalization process even more complex, unless you use methods which are explicitly designed to model graphical structures.</li>
              <li>No-SQL or unstructured databases are usually very difficult to use in AI/ML solutions as the data provides very few or zero guarantees about the data structure. Usually, some structure is enforced by application-layer logic.</li>
            </ul>`,
        },
        {
          uid: "4_3",
          objective: "Origins and sources",
          prompt: "Explore and note the process by which new data would continually be obtained, including cadence, latency, and any manual processes which might be difficult to automate. Who is responsible for this and how will continuity be guaranteed?",
          moreInfo: `
            <p><b>The need for continual integration</b> — If you're only aiming for a one-off analysis, without a production use-case, it might be OK to perform heavily manual data cleaning and preparation. But in most cases, you'll need to continually repeat data preparation - either for incremental model re-training and re-validation as new data arrives, or to enable continual inference in production use. This means you have to figure out how data will be continually integrated from other systems or sources.</p>
            <p><b>Replacing manual processes</b> — If data preparation involves some manual steps, it's important to consider ways around this - either automation of the manual process, or substitution with other sources (even if the substitutes are less ideal).</p>
            <p><b>Ensuring truth</b> — Aim to obtain data from the most trustworthy, correct source. Others are likely to come to rely on your more guaranteed, trustworthy data. It's worth making it as correct as possible.</p>
            <p><b>Cadence</b> — The cadence or frequency of updates is often important to ensure up-to-date data is available. Many systems produce data in daily or hourly batches, which may be insufficient if you need to use that data earlier. It can be difficult to push to re-engineer these systems for more frequent data. You should consider whether you can make-do with older data, or have processes to deal with the absence of the most recent values. What impact will cadence have on your solution?</p>
            <p><b>Latency</b> — Latency is the delay between the time of a real event or measurement and the data becoming available on your system. It is different to cadence - you can have regular updates of data which is still delayed by days! Like cadence, note down the potential hurdles latency could introduce and some potential means of dealing with latency in key data sources.</p>`,
        },
        {
          uid: "4_4",
          objective: "Data quality",
          prompt: `Note any known issues, concerns or risks due to data quality. Consider obtaining Exploratory Data Analysis (EDA), which should identify potential issues such as:
            <ul>
              <li>Missing or sparse data</li>
              <li>Very uneven value distribution, or many rare values in categorical data</li>
              <li>Inconsistent data types or encoding / recording</li>
              <li>Need for dimensionality reduction</li>
            </ul>`,
          moreInfo: `
            <p><b>Exploratory Data Analysis (EDA)</b> — In previous questions you have identified the data and where it might come from. Now it's time to think about the quality of the data. This is often part of a PoC or an AI/ML project and isn't usually part of the planning stage. However, you should be aware of it because analysis of the data might already exist, and you might be able to make use of it. This analysis is often called "Exploratory" data analysis, because it isn't guided towards a specific goal. Instead, it's an open-ended explore of what's available. EDA typically covers the following:</p>
            <p><b>Missing and sparse records</b> — Quality issues include: Missing data (linked records are simply not present); Sparse data (the data is there, but many values are defaults, blank, or otherwise incomplete - the ratio of complete to incomplete data is low, or alternatively the frequency of observations or other records is low).</p>
            <p>There are two solutions to missing and sparse data: Imputation (replacing missing data with default or average values) and exclusion (cutting these records out of the data). Imputation affects the quality of your results, and exclusion reduces the size of your dataset - potentially fatally, if there's not enough data left. That's why it's important to examine the data as soon as possible.</p>
            <p><b>Distributions</b> — Another quality issue is the distribution of values. Distributions describe the range of values encountered and the frequency of each value. Distributions can be problematic because rare values are usually modelled poorly by AI/ML models (which are statistical in nature) and therefore need careful handling and evaluation.</p>
            <p><b>Consistency</b> — Consistency refers to the ease with which machines can interpret data, both statistically and practicably. For example, if data encoding as text or number types is inconsistent, it may be hard to recognise equivalent values. Similarly, if there is bias or inconsistency in the way data was recorded, this will affect the quality of your AI/ML models and solutions. Without strict instructions, human-entered data is usually quite inconsistent. Free text data has historically been especially difficult to interpret, although modern Large-Language Models such as ChatGPT may make this easier in future.</p>
            <p><b>Dimensionality</b> — Dimensionality refers to the number of independently variable elements or values in the data. Most datasets have too many dimensions (also known as features) and too few samples. This can lead to overpowered models which are impractical to train and generalise badly. For these reasons, data scientists and ML researchers often speak of the "curse of dimensionality".</p>
            <p>If your data has many dimensions (features) and especially if it has few samples, you might want to plan to reduce the dimensionality of your data as part of your project. This process is known as dimensionality reduction.</p>`,
        },
        {
          uid: "4_5",
          objective: "Recognise the value of your data",
          prompt: "Integrated, trustworthy and coherent datasets are very valuable, even without use in an AI/ML solution. Consider how the dataset you are producing for the project can be used in other business functions, perhaps replacing less well maintained or more inconsistent / outdated data sources. This may be a key value proposition of your project. Where can you find uses for your data?",
          moreInfo: `
            <p>Actively explore additional use-cases for the data you will produce in your project. Shop the data around your stakeholders and other colleagues to see who is inspired by it. Tell people it's available - put it in your internal newsletter!</p>
            <p>We have many experiences that once we create the data for an AI/ML project, other users and uses appear and start emailing and phoning us begging for access to it. It will be better than their existing data, because you're forced to find the most trustworthy sources, link them together, clean up all the bad values, and be able to repeat this exercise consistently. Often, the data becomes the first early value delivered by an AI/ML project. Make sure you plan to leverage it.</p>`,
        },
      ],
    },
    {
      number: 5,
      navLabel: "Solution design",
      title: "Designing an AI or ML Solution",
      subtitle: "These questions will help you transform your problem and requirements into the outline of a solution.",
      builderIntro:
        "The objective of this section is to broadly define the way the solution could work, without attempting to resolve all the technical details in advance. Your answers will include the way the problem or data is represented, and how the solution will be evaluated. These answers will narrow the technical choices available, and lead to specific AI/ML methods. However, to actually implement your solution, you'll need at least a small team with experience in AI/ML, software engineering, etc.",
      questions: [
        {
          uid: "5_1",
          objective: "Identify key entities",
          prompt: `Take a minute to think about key entities and concepts involved in your solution. Make notes here. Try to identify:
            <ul>
              <li><b>Classes</b> - key types of entity</li>
              <li><b>Samples</b> - many independent instances of classes, to which inference or optimisation is applied</li>
              <li><b>Features</b> - properties or attributes of each sample, such as measurements</li>
              <li><b>Targets</b> - labels, known correct outputs, evaluation function, etc.</li>
            </ul>`,
          moreInfo: `
            <p>Since you're considering an AI/ML project, you're going to be dealing with a quantity of data. This data will have structure which you should capture here. We'd like you to consider 4 aspects:</p>
            <p><b>Class</b> — A class is a name for a type of object or event. For example, "Car" is a name for a class of wheeled vehicles. Each individual car object is an instance of the Car class.</p>
            <p>There might be several key entities in a complex project. Name the most important ones as classes. For example, if you're optimizing vehicle pickups from depots to minimize total travel time, your classes might be vehicles and depots. Individual vehicles or journeys might be samples (see below). Try to keep it simple - the aim here isn't to produce a detailed taxonomy or design software, just to identify key entities as classes.</p>
            <p><b>Samples</b> — You're not looking for a one-off calculation - you're looking for a repeatable process. You're going to repeat that process with different "things" of the same type - these are your samples.</p>
            <p>Samples are instances of your classes. For example, if you're going to classify images according to their content, the images are your samples. Each image is one <a href="/articles/sample/" target="_blank">sample</a> (or sample unit - confusingly, people often use sample to mean one, or one group of things).</p>
            <p><b>Features</b> — Features are the attributes of the samples. For example, let's say our classes are cars, and in our sample of cars we have recorded year of manufacture, make and model. These three attributes are our features.</p>
            <p><b>Targets</b> — We should also think about how to evaluate solutions. You will need to provide some sort of target for learning or optimisation. Do you have labels, or numbers which are instances of correct answers? Or, do you have a scoring function which can evaluate candidate solutions to the problem? Note how you would measure the quality of outputs from your AI/ML methods.</p>`,
        },
        {
          uid: "5_2",
          objective: "Approach",
          prompt: `Will your solution be:
            <ul>
              <li><b>Automation</b>: The solution will perform a task without human intervention, although perhaps with human review.</li>
              <li><b>Decision support</b>: The solution will help people to complete a process, perhaps with recommendations.</li>
              <li><b>Generate insights</b> or data for people to use</li>
            </ul>
            <p>Describe how your solution will do one of these things using specific terminology from your problem statement and explaining how it fulfills part of the value proposition.</p>`,
          moreInfo: `
            <p>What do you propose your solution will do? It should be something which addresses your problem statement and fulfils part of your value proposition.</p>
            <p><b>Automation</b> is a high stakes approach - you need to be sure you'll achieve such a high level of performance that mistakes will either never happen, or you'll be able to deal with the consequences. It's appropriate when the problem is well understood, especially if the statistical properties of the data do not change (for example, physical processes). It's not a good idea when the statistics of the data are nonstationary (meaning they constantly change), such as user behaviour. In this case, you'll need continual re-training and re-evaluation of your solution.</p>
            <p>Automation can be made safer by building in human review and exception-handling processes from the start. Ensure you know the consequences of these exceptions and how you will be able to identify them (other than by user complaints!)</p>
            <p>A safer way to represent your problem is <b>Decision Support</b>. This means the solution will work with humans to help them do their jobs more effectively and efficiently. One way to do this is to get the AI/ML to make recommendations, which human experts can choose to review and accept, modify or reject. This process places exception-handling at the centre of the process - you will create workflows and user-interfaces for this to happen continually. Fail-safes are built-in. Decision support is appropriate when the AI/ML must perform specific tasks, but you know it won't be perfect and you need ways to deal with the exceptions.</p>
            <p>The third problem representation is <b>insights creation</b>. This differs from decision support in that the insights are less targeted towards a specific use-case and more for open-ended exploration of the data. Insights solutions are similar to Business Intelligence (BI) platforms, but may still have very sophisticated algorithms or models underneath to generate specific insights. They are not simply data visualisation. Insights outputs might include anomaly detection or trend analyses, based on ML models. If your solution produces insights, your users must action those insights.</p>`,
        },
        {
          uid: "5_3",
          objective: "Problem representation",
          prompt: `This question may require some AI/ML expertise, but have a go anyway. You can always change the answer later. Popular AI/ML problem representations are listed below. Which one will you use? How will it be fitted to your problem?
            <ul>
              <li>Optimization (you must be able to generate and evaluate all possible solutions; AI can search through them efficiently)</li>
              <li>Unsupervised Learning (discover patterns in data)</li>
              <li>Supervised Learning - requires a large dataset of samples with "correct" answers. Will learn to generate "correct" answers for other samples. There are two main types:
                <ul>
                  <li>Classification: The answers are categorical labels, such as Case/Control or 0/1.</li>
                  <li>Regression: Approximating a function; the answers are real numbers such as 5.18.</li>
                </ul>
              </li>
              <li>Reinforcement Learning. You must create a function which defines the quality (reward) of any action or output of the solution. Used when there's no "correct" answer, but the quality of answers can be evaluated.</li>
            </ul>`,
          moreInfo: `
            <p>This is one of the more technical questions, but don't stress if you can't answer confidently. It's worth having a go and understanding some of the possibilities out there.</p>
            <p><b>Supervised Learning</b> — One of the most common ML approaches is Supervised Learning. Supervised means there's a way to supervise the behaviour of your model by comparing its output to a set of correct answers. These answers must be available, and lots of them.</p>
            <p>Answers can be categorical (e.g. correct labels for classes such as "Disease" and "Healthy") or numerical. If the answers are categorical, you may want to use a Classification problem-representation. Classification simply means "tell me the class of this sample".</p>
            <p>If the answers are numerical, you can use a Regression problem-representation. Another way to think of regression is as function approximation - the model will learn a magical function to reproduce the correct output numbers given the input features.</p>
            <img src="/assets/images/supervised_learning_classification_vs_regression.png" alt="Classification vs regression: categorical labels vs real-number outputs" style="max-width:100%;" class="my-2" />
            <p>The figure below shows some other common problem-representations.</p>
            <img src="/assets/images/optimisation_reinforcement_learning_unsupervised_learning.png" alt="Diagram contrasting optimisation, reinforcement learning, and unsupervised learning" style="max-width:100%;" class="my-2" />
            <p><b>Optimisation</b> — An optimisation problem involves searching through a space of potential solutions to find candidate solutions that maximize or minimize an objective function. The objective function must be able to provide a numerical score for any candidate solution. All possible solutions must be represented in the space; AI algorithms will try to search the space efficiently to find good solutions. Optimization is typically used when the problem is well defined, but highly constrained and the primary difficulty is finding good candidate solutions. The methods are relatively simple and all outputs are interpretable.</p>
            <p>Optimization problem representations include Timetabling and Scheduling, Vehicle Routing, Bin-Packing and other assignment problems. They typically have "hard" constraints (must be satisfied) and "soft constraints" (do your best).</p>
            <p><b>Reinforcement Learning</b> — Reinforcement learning frames the problem as an Agent, which interacts with a World. The Agent receives Observations from the World and must learn to generate Actions which produce high Rewards. A Reward is simply a number which represents the quality of the most recent Agent Action. The Agent interacts with the world over a period of time, usually called an Episode, making many actions and accumulating many Rewards. You must be able to define the reward of any action in any state of the Agent and World, and also enumerate all potential actions, which do not change over time.</p>
            <p><b>Unsupervised Learning</b> — Unsupervised learning is pattern or structure detection in data. It aims to reduce a large amount of data to a smaller set of model parameters which capture it as accurately and comprehensively as possible. For example, clustering of user behaviour - if you can find clusters in your data, you can start to think about what types of user those clusters represent and look for differences in behaviour between those clusters. Unsupervised learning can also be used for dimensionality reduction.</p>
            <p>Unsupervised learning usually doesn't directly solve a problem, but it generates insights about the data.</p>`,
        },
        {
          uid: "5_4",
          objective: "Data transformation",
          prompt: "AI/ML solutions rarely use structured (relational) data; instead, relational data is usually transformed to tabular format. Even if your data is images or video, it will usually still have the same structure - many samples, each with the same features. How will you transform your various data sources into a single tabular format? Pay particular attention to links between data and cardinality changes.",
          moreInfo: `
            <p>You have already explored data structure in a previous question (section on Data). In the previous questions, you have identified what your AI/ML solution should do, and the problem representation you might use. Given that knowledge, it's now time to think about how to fit the data to that representation.</p>
            <p>Consider the figure below:</p>
            <img src="/assets/images/create_dataset_for_ml.png" alt="Joining Customer and Subscription tables into a single ML dataset, including a calculated Subscription duration feature" style="max-width:100%;" class="my-2" />
            <p>Let's say we want to explore the relationship between customer demographics and subscription cancellation.</p>
            <p>In this figure, we have a relational database (or two input spreadsheets) which hold attributes of the class we're modelling: Customer-Subscriptions. The table at the bottom is our ML dataset, which includes details of customers and their subscriptions.</p>
            <p>To produce a ML dataset we have to join multiple data sources together. We need to copy across attributes about Customers (such as age) and attributes about Subscriptions (e.g. status).</p>
            <p>You will need to deal with cardinality changes (e.g. there are many subscriptions per customer) and think about how that will affect the algorithms, models and results.</p>
            <p>If we have questions like "do older customers keep their subscriptions for longer?" we need to calculate new attributes during the transformation process - in this example, we have calculated "Subscription duration" from Subscription start and end dates.</p>
            <p>Finally, which of these features are labels or target outputs, if you're using a problem representation that requires them?</p>`,
        },
        {
          uid: "5_5",
          objective: "Outline the Pipeline",
          prompt: `<p>Sketch out the steps involved in obtaining and producing data for your solution, continuously.</p>
            <p>If you must provide "correct answers" for your chosen approach, how will those answers be produced? How will you conduct human or automatic feedback to continuously measure solution performance?</p>
            <p>How will users or operators interact with the solution?</p>
            <p>How are its outputs integrated into other systems?</p>`,
          moreInfo: `
            <p>In the transformation question, we asked you to provide detail on how the data would be transformed to fit the problem representation. Now we want you to take a step back and look at the bigger picture - the entire process or pipeline of steps that need to happen to feed data into your solution, and to take the results and provide them to users or stakeholders so they can benefit from them.</p>
            <p>Consider the various systems and data sources you need to attach, and how you will record, distribute and present the outputs.</p>
            <p>If your approach involves human review and continual evaluation, how will this happen? How will issues be detected, tracked and resolved? If human review is not part of your approach, how will you deal with faults and errors? Can you capture feedback from users of downstream systems?</p>`,
        },
      ],
    },
    {
      number: 6,
      navLabel: "Evaluation",
      title: "Measuring and evaluating a Machine Learning Solution",
      subtitle: "Answer these questions to learn how you can measure and validate your solution, and understand how it might be biased.",
      builderIntro:
        "How will you measure the performance of your solution? Failure to evaluate cautiously and thoroughly can provide a false sense of confidence in the solution, jeopardizing the project in production or deployment.",
      questions: [
        {
          uid: "6_1",
          objective: "Qualitative",
          prompt: "How will you evaluate the solution's performance in terms that are meaningful to stakeholders? For example, examination of system behaviour under specific conditions or results for known examples.",
          moreInfo: `
            <p>It can be difficult to understand what numerical performance metrics mean in real-world terms. This section should help you to define qualitative ways to evaluate AI/ML solution performance. It's absolutely vital to be sure you are measuring solution performance in meaningful ways. The purpose of this question is to plan to ensure your evaluation is meaningful.</p>
            <p><b>Examine specific examples</b> — When using Machine Learning, you will get lots of answers. It can be helpful to examine some specific samples in detail to get a better idea how things work. You can select samples randomly, or deliberately select samples with unusual characteristics.</p>
            <p>For example, you might look at samples which were known to be unusual or problematic for some reason. Or, you can identify samples where particular input feature values are present, and verify the outputs make sense. SMEs are helpful to pick out extreme and unusual input features and define what good outputs might be. For these deep-dives into specific samples, it helps to have SMEs define good outputs, and to make graphics or outputs which help with assessment.</p>
            <p><b>Compare to naive, baseline models</b> — Another way to gain insight into model behaviour is to define naive, baseline models such as "predict average value", "predict median value" or "predict most frequent label all the time". When your classes are imbalanced, this helps to see whether your ML models are actually any better than chance!</p>
            <p><b>Feature importance</b> — Next, you can look at <a href="https://link.springer.com/article/10.1007/s42452-021-04148-9" target="_blank">feature importance</a>. There are many feature-importance techniques, but all of them aim to explain which features contributed the most to some outputs. Some models are more interpretable than others; <a href="https://cloud.google.com/explainable-ai" target="_blank">explainable AI</a> techniques are useful to interpret feature importance for complex, "black-box" ML models. Once you've pulled out some measures of feature importance, plan to check with your SMEs if the right features are being used. Some models (such as logistic regression) have easily interpreted coefficients which also indicate the direction of effect; SMEs can verify these too.</p>
            <p><b>Checking cost terms</b> — Finally, if you're using Optimization techniques, you can dive into specific assignments or schedules and check the implementation of constraints and cost terms are correct. These are interpretable by definition, so you just need your SMEs to check the equations and outputs are correct.</p>`,
        },
        {
          uid: "6_2",
          objective: "Quantitative",
          prompt: `<p>What numerical performance metrics can you use to evaluate your solution? Which variables or outputs will be measured using each metric? How good is "good-enough", or what minimum performance is necessary? Do you have any existing systems or human performance which can act as a baseline?</p>
            <p>Plan to measure in ways which will reflect real-world utility and establish the viability of the identified use-case.</p>`,
          moreInfo: `
            <p>To conduct systematic experiments and achieve <a href="https://www.collinsdictionary.com/dictionary/english/objective-measurement" target="_blank">objective</a> progress you need to agree on numerical measures of solution performance. You can use more than one metric; different metrics expose different weaknesses, and help you understand why your solution is failing and how to improve it.</p>
            <p><b>What to measure</b> — The first aspect to consider is which output[s] to measure. This may be obvious from your problem representation (i.e. the thing you're optimizing or training the model to do), but sometimes you can only approach the problem indirectly and you need aggregate output functions to assess overall performance meaningfully - in addition to the outputs of your models or algorithms.</p>
            <p><b>Classification metrics</b> — In a classification problem representation, there are many metrics available, and we would recommend implementing all the most popular. Many assume binary classification (two outcomes) but can be extended to multi-class, multi-label settings. They include: <a href="https://developers.google.com/machine-learning/crash-course/classification/accuracy" target="_blank">Accuracy</a> (correct answers / all answers); <a href="https://developers.google.com/machine-learning/crash-course/classification/precision-and-recall" target="_blank">Precision</a> (fraction of predicted true outputs which are actually true); <a href="https://developers.google.com/machine-learning/crash-course/classification/precision-and-recall" target="_blank">Recall</a> (fraction of true labels which are predicted as true); <a href="https://en.wikipedia.org/wiki/F-score" target="_blank">F-Score</a> (average of precision and recall - i.e. considers both); <a href="https://en.wikipedia.org/wiki/Sensitivity_and_specificity" target="_blank">Sensitivity &amp; Specificity</a> (see link for explanation).</p>
            <p>Relying on just one metric can be misleading, e.g. if you measure accuracy in an imbalanced dataset where 95% of answers are "0", you can get 95% accuracy by just guessing "0" all the time! This is obviously not intelligent or desirable.</p>
            <p><b>Regression metrics</b> — In a regression problem you have a continuous range of output values. Metrics to measure output performance include: <a href="https://statisticsbyjim.com/regression/interpret-r-squared-regression/" target="_blank">R-squared</a> (also known as <a href="https://en.wikipedia.org/wiki/Coefficient_of_determination" target="_blank">coefficient of determination</a>; measures how well the input feature variables predict the output variable; note several similar definitions); <a href="https://en.wikipedia.org/wiki/Mean_absolute_error" target="_blank">MAE</a> (Mean Absolute Error); <a href="https://en.wikipedia.org/wiki/Mean_squared_error" target="_blank">MSE</a> (Mean Square Error); <a href="https://en.wikipedia.org/wiki/Root-mean-square_deviation" target="_blank">RMSE</a> (Root Mean Square Error).</p>
            <p>See <a href="https://en.wikipedia.org/wiki/Regression_analysis" target="_blank">this article</a> for intuition on choosing a metric. MAE is usually easier to interpret than RMSE.</p>
            <p><b>Baselines and acceptance criteria</b> — Is there any minimum performance necessary for solution viability or client acceptance criteria? You'll need to measure these to ensure you can meet them. It's also useful to measure existing solution performance (even with 3 rounds of human expert review, errors always slip through regardless what people may claim). Having a human / existing solution baseline helps to justify your project, and prevents unfair comparison to anecdotal or subjective claims about how well the old way works. It's best to define these now before you get into arguments about them!</p>`,
        },
        {
          uid: "6_3",
          objective: "Fairness and generalization",
          prompt: `<p>How will you evaluate your solution appropriately and fairly, minimizing bias?</p>
            <p>How will you ensure your solution generalizes from your existing data, to real-world conditions? How can you ensure your data is representative of the variability of future, real-world data?</p>`,
          moreInfo: `
            <p>Let me convince you that the performance of an ML solution in your existing data does not matter. What actually matters is the real-world performance of your ML solution, which you can't measure until you put it into production (and even then, you might be alienating some user groups without being aware of it). Generalization refers to use of a model in the real world, after training it on a limited sample of data.</p>
            <p>To estimate how your solution might perform in real world conditions (i.e. how it generalizes), you can plan to use validation techniques such as <a href="/articles/bootstrap-validation/" target="_blank">Bootstrap resampling</a> and <a href="https://scikit-learn.org/stable/modules/cross_validation.html" target="_blank">cross-validation</a>, which repeatedly train and evaluate your ML models on different subsets of data.</p>
            <p><b>Bias</b> — Now let's talk about why using those validation techniques might not work as well as you might hope. One common reason is <a href="/articles/bias/" target="_blank">bias</a> - which can be a part of your data, your models or algorithms, and your wider business processes! Bias isn't just a thing you should worry about for ethical reasons. It can destroy the entire value proposition of your solution, rendering it at best useless and at worst destroy your business. And you wouldn't know until it's too late! This is serious stuff.</p>
            <p>This is not only about models which deal with people. For example, imagine you're a fastener manufacturer who adjusts machines to handle a certain component size tolerance. You produce a month's worth of stock with biased statistics about actual component tolerance - and 95% of them are defective as a result!</p>
            <p>Look at the figure below, which illustrates bias in data used to train a ML animal classifier. The classifier tries to predict if a picture contains a dog, or a cat:</p>
            <img src="/assets/images/bias_concept.png" alt="A cat/dog image classifier trained mostly on light-furred cats and dark-furred dogs misclassifies a real-world dark-furred cat as a dog" style="max-width:100%;" class="my-2" />
            <p>Using the training data provided, the model learns well and scores highly on performance metrics. But when we give it the "real world image" on the right, it is completely wrong. Worse, it is very confident in its wrong answer!</p>
            <p>Can you work out why the model is wrong? The training data is biased because it is not representative of the variety of fur colours in real-world cats. In fact, all the dark furred animals are dogs, which the classifier exploits to label any dark-furred animal as a dog.</p>
            <p>Now that you understand bias, what steps will you take to detect and control bias in your AI/ML solution?</p>
            <p><b>Ethical and Responsible AI</b> — A number of businesses have developed <a href="https://www.pwc.com/gx/en/issues/data-and-analytics/artificial-intelligence/what-is-responsible-ai.html" target="_blank">material</a> to help you address bias by embracing ethical and responsible AI <a href="https://www.industry.gov.au/publications/australias-artificial-intelligence-ethics-framework/australias-ai-ethics-principles" target="_blank">practices</a>. You should aim to be familiar with the risks and mitigation strategies at a project design phase, and note risks you have identified and strategies you will adopt in response. This might include:</p>
            <ul>
              <li>First seeking to measure and understand if your data is representative of real-world conditions</li>
              <li>Seeking new data or surveying specific user groups</li>
              <li>Re-weighting or re-sampling the data used</li>
              <li>Explicitly evaluating performance in under-represented sample groups</li>
            </ul>`,
        },
      ],
    },
    {
      number: 7,
      navLabel: "Adoption",
      title: "How to gain and maintain adoption of AI/ML Solutions",
      subtitle: "Prepare in advance to ensure you can continue to deliver a successful project.",
      builderIntro:
        "How will you measure the success of your <b>project</b>, not your solution? Capture key business metrics and impacts that will demonstrate the value of the solution you have provided. Note down <b>actions you will need to take</b>, to ensure these impacts are realised.",
      questions: [
        {
          uid: "7_1",
          objective: "Ownership",
          prompt: "Who will own, operate and maintain the solution? (Teams or individuals). Can more be done to achieve and sustain adoption of the solution? Who will provide technical support?",
          moreInfo: `
            <p>There are a number of roles associated with an AI/ML project, even if the result is purely one-off advisory work and isn't a production system.</p>
            <p><b>Maintaining knowledge</b> — Who will be responsible for ensuring knowledge and experience generated during the project is maintained, documented, communicated to those who need it, and not lost?</p>
            <p><b>Adoption</b> — Even after the project, the work (data, or methods) will often have value. Who will take the opportunity to reuse this work in other business areas or projects? This requires ongoing socialization of the project outcomes.</p>
            <p><b>Operation and maintenance</b> — If the project will ultimately lead to a solution in regular use, who will be responsible for operating and maintaining it? People often come to rely on software without necessarily having any guarantees that the service will continue. Who (if anyone) is maintaining the quality of the service or data? Do they have time for that? Who can be called if there is an issue?</p>
            <p><b>Ownership</b> — The project may generate expectations, liabilities and other risks. For example, a business may make strategic decisions based on conclusions from an AI/ML project or solution. Who is responsible for the outputs of the project?</p>
            <p><b>Intellectual Property (IP)</b> — If the business wishes to sell, publish or use the solution in future, are there any legal constraints? Who can sign off on use of this IP?</p>`,
        },
        {
          uid: "7_2",
          objective: "Users",
          prompt: "Who are the users of the solution? How many users are expected? How can you measure uptake and use?",
          moreInfo: `
            <p>Having developed your project into concrete solution ideas, explore who might be users of a solution and how many users you would expect. These numbers affect technical choices around solution scaling and performance.</p>
            <p>In addition, you can monitor uptake and use of the solution, if it is not a mandatory replacement of another process. Voluntary use of any of your project outputs is a measure of success. How can you measure use?</p>`,
        },
        {
          uid: "7_3",
          objective: "Consumers",
          prompt: "Who - or what - will consume or rely on outputs of the solution?",
          moreInfo: `<p>List the systems, processes and/or users who will consume (use) the outputs of the solution and/or project.</p>`,
        },
        {
          uid: "7_4",
          objective: "Integration strategy",
          prompt: "How will the solution be integrated into existing business processes and systems? What input and output dependencies will exist?",
          moreInfo: `
            <p>This step is important to understand both dependencies and integration impacts of the solution or project.</p>
            <p>First, look at the input dependencies - anything or anyone that produces input necessary for the system, especially if it continually varies (such as new events). It's also important to capture relatively static inputs such as map, network or inventory data so that it can be updated periodically.</p>
            <p>Next, look at the output dependencies - anything or anyone that consumes (uses) the outputs of the solution or project - whether that use is simply new insights or actionable data. Try to include by name any process or system which is affected.</p>
            <p><b>Managing changes to dependencies</b> — Make notes on which dependencies are likely to require changes - either to your solution or project, when new data or data formats become available - and how output dependencies will be affected by changes you make. Are you able to warn of these changes and provide dependant systems time to react?</p>`,
        },
        {
          uid: "7_5",
          objective: "Deployment strategy",
          prompt: `<p>Consider how to deploy the solution to minimise technical and change risks. Potential <a href="https://www.harness.io/blog/blue-green-canary-deployment-strategies" target="_blank">strategies</a> include:</p>
            <ul>
              <li>Duplication and parallel operation of existing process for verification</li>
              <li>Canary (gradual introduction across userbase, see who screams)</li>
              <li><a href="https://docs.aws.amazon.com/whitepapers/latest/overview-deployment-options/bluegreen-deployments.html" target="_blank">Blue/green</a> (enables seamless rollback after changes)</li>
              <li><a href="https://hbr.org/2017/06/a-refresher-on-ab-testing" target="_blank">A/B testing</a> (helps to verify benefits of modified process)</li>
            </ul>
            <p>Note: Ensure validation is always part of any new model deployment!</p>
            <p>How would you rollback and defer deployment if problems are encountered? Plan for regular deployments over the lifetime of a production solution.</p>`,
          moreInfo: `
            <p>Deployment is always a high stakes time for any project, but especially when big changes to key processes are involved, such as new automation or highly data-driven processes. Explicitly outline your deployment strategy now to show you have considered these risks and propose suitable mitigations.</p>
            <p>Different deployment strategies can help to mitigate different risks. For example, if your project or solution changes user experience, you may want to use A/B testing or Canary deployment to verify users are happy with the new system.</p>
            <p>AI/ML solutions often require regular deployment to manage continually changing data. This means that you need to have a safe process for repeatedly deploying new models, which may behave in different ways.</p>
            <p>The ability to roll-back a deployment without data loss can be crucial. Some deployment strategies offer this; in some systems it may be very difficult to recover user-data from a deployment after roll-back.</p>
            <p>Finally, consider what service-level guarantees you are required to provide and how deployment strategy can contribute to, or jeopardize these. For example, if you are required to achieve very high levels of <a href="https://en.wikipedia.org/wiki/Uptime" target="_blank">uptime</a>, you may need a deployment strategy which involves no downtime.</p>`,
        },
        {
          uid: "7_6",
          objective: "Documentation and training",
          prompt: "How will you document the design, use and other technical details of the solution - where will the documentation live? How will you provide training to users and maintainers? In addition, note the legal status of any Intellectual Property (IP) generated by the project.",
          moreInfo: `
            <p>The project team will move onto other things, so whatever type of AI/ML project this was, a huge amount of the value is stored in the knowledge that was gained. It's important to plan to retain that knowledge. Documentation is a big part of that.</p>
            <p>To make documentation successful, list some key documents that will be produced and maintained (incrementally updated) over the course of the project. Make this documentation part of your project plan and make sure it happens. This might include:</p>
            <ul>
              <li>Requirements analysis</li>
              <li>Solution design</li>
              <li>Methodology</li>
              <li>Results, and validation results</li>
              <li>Experimental diary</li>
              <li>Software source code (use version control, e.g. <a href="https://github.com/" target="_blank">Github</a> or <a href="https://bitbucket.org/" target="_blank">BitBucket</a>)</li>
              <li>Knowhow (e.g. how to run experiments, how to evaluate results, etc.)</li>
              <li>User guides</li>
              <li>Support guides</li>
            </ul>
            <p>To keep the documentation relevant and accurate, it's important to use a shared, online platform such as a <a href="https://www.techtarget.com/whatis/definition/wiki" target="_blank">Wiki</a> to produce it collaboratively. The edit process must be hassle-free.</p>
            <p>Some technical documentation can be stored in your version control system, but the majority should be accessible to non-programmers. There are a number of <a href="https://pages.github.com/" target="_blank">free</a> and commercial Wiki solutions, such as <a href="https://www.atlassian.com/software/confluence" target="_blank">Confluence</a>.</p>
            <p>Lastly, make a note of the IP constraints on your solution, due to internal choices or due to use of third-party software or data which may create restrictions on commercial use. IP is also part of your project's value - ensure you know who controls it, and what you own!</p>`,
        },
        {
          uid: "7_7",
          objective: "Socialisation and awareness",
          prompt: "Make a plan to socialise the benefits of the solution and raise awareness of your successes. How will you build momentum and interest in your project, both now and through to delivery and even after adoption?",
          moreInfo: `
            <p><b>Regular communication</b> — Your project will need ongoing support from stakeholders and leaders. It's important to share news about the project - good and bad - so that people are aware of the project and its potential. You might also discover new opportunities and applications this way! How will you regularly share news? How can you register who's interested?</p>
            <p><b>The value of data</b> — There are also incidental benefits of the project, which you can only exploit if you become aware of them by talking to people. A major one is the value of the data you will produce. You will find it essential to do the hard detective work of cleaning and linking the most definitive dataset possible - many other business functions may well find that extremely useful. Plan to shout about that outcome and let people become aware it's available.</p>
            <p><b>Build investment</b> — When people get regular updates about a project, they become more interested and invested in it. They understand the difficulties and appreciate the work you're doing. They recognise your wins. But when you rarely communicate, they may only hear the bad news, and won't be as forgiving. Build investment through regular communications with all stakeholders.</p>
            <p><b>Looking further afield</b> — Can you communicate your findings or results with other industry groups - perhaps by speaking at an industry conference? That can help your organisation raise their profile, and it'll put you in touch with people who are tackling similar problems. You can also consider academic publications.</p>`,
        },
      ],
    },
  ],
};
