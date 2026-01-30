import Link from 'next/link'
import { Metadata } from 'next'
import Header from '@/components/Header'

export const metadata: Metadata = {
  title: 'Whitepaper',
  description: 'The Union Chant whitepaper: A vision for scalable direct democracy through tiered small-group deliberation.',
}

export default function WhitepaperPage() {
  return (
    <div className="min-h-screen bg-surface">
      <Header />

      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link href="/" className="text-muted hover:text-foreground text-sm mb-8 inline-block">
          &larr; Home
        </Link>

        <article className="bg-background rounded-lg border border-border p-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">Union Chant</h1>
          <p className="text-xl text-muted mb-12">Collective Decision-Making for the Modern Age</p>

          <hr className="border-border my-8" />

          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-foreground mb-4">The Problem We All Feel</h2>
            <p className="text-subtle leading-relaxed mb-4">
              Have you ever been in a meeting where the loudest person in the room won the argument? Or watched an online poll get hijacked by a vocal minority? Or felt like your vote didn't really matter because you were choosing between options you didn't help create? You're not alone.
            </p>
            <p className="text-subtle leading-relaxed mb-4">
              These experiences are universal. Whether it's a company deciding on a new policy, a community choosing how to spend funds, or a nation debating public priorities, the same challenges appear again and again. There are too many voices and not enough listening.
            </p>
            <p className="text-subtle leading-relaxed">
              When large groups need to decide together, we usually rely on one of two approaches. We either open the floor to everyone at once—through town halls, comment sections, or social media—where volume and persistence tend to outweigh reflection. Or we narrow participation to committees, representatives, or experts, where decisions are made by a small group while most people observe from a distance. The first approach often leads to confusion and fatigue. The second often leads to disengagement and mistrust. Neither consistently produces decisions people feel connected to.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-foreground mb-4">Why This Matters Now</h2>
            <p className="text-subtle leading-relaxed mb-4">
              We live in a time of unprecedented connectivity. Billions of people can communicate instantly across the globe. We have the technology to include everyone. In principle, inclusion has never been easier.
            </p>
            <p className="text-subtle leading-relaxed mb-4">
              In practice, our decision-making tools have not kept pace. Social platforms amplify conflict more effectively than understanding. Online voting increases participation but often reduces deliberation. A poll with a million responses does not necessarily reflect deeper thinking than one with a hundred if people are reacting rather than considering trade-offs. Remote and hybrid work has moved many decisions into chat threads and video calls, where speed and assertiveness still dominate.
            </p>
            <p className="text-subtle leading-relaxed">
              We can reach everyone. We have not yet learned how to listen at scale.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-foreground mb-4">A Simple Idea: Small Groups, Big Decisions</h2>
            <p className="text-subtle leading-relaxed mb-4">
              What if there was a way for thousands of people to genuinely deliberate together? Not just vote, but deliberate. To share ideas, discuss trade-offs, change minds, and arrive at decisions that reflect genuine collective wisdom rather than whoever showed up first or shouted loudest.
            </p>
            <p className="text-subtle leading-relaxed mb-4">
              Union Chant is built on a straightforward observation: meaningful discussion happens in small groups. Think about the best discussions you've ever had. They probably weren't in a stadium or a comment section. They were around a dinner table, in a small meeting, with a few people who had time to actually listen to each other.
            </p>
            <p className="text-subtle leading-relaxed mb-4">
              Most people can recall productive conversations that took place in settings where participants had time to explain their reasoning, hear other perspectives, and revise their views. These conversations rarely happen in large, unstructured settings. Union Chant applies this small-group dynamic to large-scale decisions by structuring many such conversations in parallel and connecting them through a clear, repeatable process.
            </p>
            <p className="text-subtle leading-relaxed font-medium text-foreground">
              Scale, in this model, is not achieved by enlarging the conversation. It is achieved by multiplying conversations.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-foreground mb-4">How It Works</h2>
            <p className="text-subtle leading-relaxed mb-4">
              Imagine 1,000 people need to decide how to improve their city's public transportation. The process begins with open idea submission. All participants can propose ideas, not just respond to a preselected list. Someone suggests adding more bus routes to the suburbs. Another proposes making the subway free on weekends. A third wants to build protected bike lanes downtown. This might result in hundreds of suggestions, ranging from incremental improvements to more ambitious changes.
            </p>
            <p className="text-subtle leading-relaxed mb-4">
              Rather than asking everyone to debate all ideas at once, participants are divided into small groups of about five people. Each group is assigned a limited set of ideas—typically five or six—to discuss. Group members consider trade-offs, share relevant experience, and compare perspectives. Someone who rides the bus daily might convince someone who drives that transit matters. A budget-minded person might point out which ideas are actually affordable. At the end of the discussion, the group selects the idea they believe should advance.
            </p>
            <p className="text-subtle leading-relaxed mb-4">
              The selected ideas move to the next round. At this stage, advancing ideas are grouped into batches, and multiple small groups independently deliberate on the same batch. Their votes are combined, and the idea with the strongest support across all groups evaluating that batch moves forward. One winner per batch means hundreds of ideas narrow to dozens. The process repeats. Dozens narrow to a small set of finalists. In the final stage, all participants evaluate the same remaining options and select a collective outcome.
            </p>
            <p className="text-subtle leading-relaxed">
              The result is a decision shaped through multiple rounds of discussion and comparison rather than a single, isolated vote.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-foreground mb-4">Why This Works</h2>
            <p className="text-subtle leading-relaxed mb-4">
              In a group of five, you can't hide. There's no algorithm burying your comment. No one can shout you down. You have space to share your perspective, and others have space to actually consider it. Everyone gets heard.
            </p>
            <p className="text-subtle leading-relaxed mb-4">
              Small groups create conditions where participation is balanced. Individuals are more likely to speak, listen, and reflect. Ideas advance not because they attract attention, but because they repeatedly earn support from different groups of people engaging with them seriously.
            </p>
            <p className="text-subtle leading-relaxed mb-4">
              As group size increases, the number of discussion rounds increases, but the experience for each participant remains manageable. Whether you have 100 people or 100,000, the experience is the same: small group discussions leading to collective decisions. Large-scale decisions become possible without collapsing into noise or excluding most people from the process.
            </p>
            <p className="text-subtle leading-relaxed mb-4">
              By the time an idea reaches the final stage, it has been evaluated across multiple contexts and compared against alternatives several times. This creates a form of legitimacy based on durability rather than a narrow majority at a single moment. That's a much stronger mandate than 51% clicking a button.
            </p>
            <p className="text-subtle leading-relaxed font-medium text-foreground">
              Now imagine a million people reaching genuine consensus on a difficult issue. Not a slim majority outvoting a frustrated minority, but a million individuals who each participated in real conversations, heard different perspectives, and arrived together at a decision they collectively shaped. That is not just a vote count. That is a mandate. That is collective will made tangible. The world has never had a tool that could do this.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-foreground mb-4">Decisions That Evolve</h2>
            <p className="text-subtle leading-relaxed mb-4">
              Union Chant does not treat decisions as permanent endpoints. Once a winning idea emerges, it becomes the standing position—but it remains open to challenge.
            </p>
            <p className="text-subtle leading-relaxed mb-4">
              Over time, new participants can join and new ideas can be submitted. When enough new proposals accumulate, another round of deliberation is triggered. The previous winner must defend its position against fresh challengers. Because it has already survived scrutiny, it enters the new process at a later stage, preserving the advantage of having been vetted. But if a stronger idea emerges, the collective position updates.
            </p>
            <p className="text-subtle leading-relaxed">
              Good ideas persist. Better ideas can replace them. The conversation never fully closes—it evolves as circumstances and understanding change.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-foreground mb-4">What Union Chant Is Not</h2>
            <p className="text-subtle leading-relaxed mb-4">
              Union Chant is not a command system. It does not issue directives, enforce outcomes, or replace leadership or expertise. It does not replace existing democratic structures.
            </p>
            <p className="text-subtle leading-relaxed mb-4">
              It is not designed to resolve emergencies or coordinate real-time action. It is meant for decisions where reflection, legitimacy, and broad input matter more than speed alone.
            </p>
            <p className="text-subtle leading-relaxed mb-4">
              Union Chant is not a popularity contest and does not optimize for engagement, persuasion, or visibility. It does not reward influence, repetition, or spectacle.
            </p>
            <p className="text-subtle leading-relaxed mb-4">
              It is also not a replacement for representative democracy. Instead, it can complement existing institutions by providing a structured way to surface collective judgment on specific questions.
            </p>
            <p className="text-subtle leading-relaxed">
              Union Chant does not guarantee unanimity or perfect outcomes. It provides a transparent process for reaching decisions that people can understand, evaluate, and revisit over time.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-foreground mb-4">Real-World Applications</h2>
            <p className="text-subtle leading-relaxed mb-4">
              <strong className="text-foreground">In organizations,</strong> important decisions are often shaped by who is present or who speaks most confidently. Union Chant allows contributions from across roles and seniority levels. Small group deliberation means the mailroom clerk's brilliant insight gets the same fair hearing as the VP's pet project. Ideas are evaluated on merit rather than rank.
            </p>
            <p className="text-subtle leading-relaxed mb-4">
              <strong className="text-foreground">In communities,</strong> participation in town halls and forums is often limited to a small, familiar group while most residents never participate. Union Chant lowers the barrier. People can join from their phones, contribute ideas on their own time, and participate in small group discussions at their convenience. More voices lead to better decisions.
            </p>
            <p className="text-subtle leading-relaxed">
              <strong className="text-foreground">In governance,</strong> citizens often feel disconnected from policy decisions between elections. Voting every few years for representatives is not the same as having a voice. Union Chant can supplement representative systems by enabling large-scale public deliberation on specific issues—giving citizens a structured way to deliberate and surface genuine collective preferences without requiring continuous engagement.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-foreground mb-4">Addressing Common Concerns</h2>
            <p className="text-subtle leading-relaxed mb-4">
              <strong className="text-foreground">Some worry that this process will take forever.</strong> Because discussions happen in parallel, large decisions can complete in a small number of rounds. In practice, processes involving thousands of participants can conclude in days rather than months. And unlike rushed votes, the outcome actually reflects deliberation.
            </p>
            <p className="text-subtle leading-relaxed mb-4">
              <strong className="text-foreground">Others ask what happens if participation drops off.</strong> The system is designed to handle partial participation gracefully. Early rounds emphasize broad inclusion, while later rounds focus on ideas that have already been widely vetted. If someone can't make one round, they can rejoin later. The process adapts.
            </p>
            <p className="text-subtle leading-relaxed mb-4">
              <strong className="text-foreground">Some raise concerns about bad actors or trolls.</strong> Small groups reduce the effectiveness of disruption. It's hard to troll effectively when you're one of five people in a discussion, and others can see your contributions. Persistent bad-faith behavior is harder to sustain when participants are visible to one another and discussion is structured.
            </p>
            <p className="text-subtle leading-relaxed">
              <strong className="text-foreground">A common question is whether this is just another voting system.</strong> It's fundamentally different. Traditional voting asks people to choose between fixed options in a single moment. Union Chant lets people generate the options, deliberate on them, and refine collective understanding across multiple rounds. It's not just counting preferences. It's building shared understanding.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-foreground mb-4">An Invitation</h2>
            <p className="text-subtle leading-relaxed mb-4">
              Many of today's challenges are not technical problems but collective ones. Organizations struggle to align around priorities. Communities fracture over shared resources. Institutions lose trust when decisions appear disconnected from lived experience. In these contexts, the question is rarely "Who is right?" It is "How do we decide in a way people recognize as fair, thoughtful, and legitimate?"
            </p>
            <p className="text-subtle leading-relaxed mb-4">
              Union Chant is one attempt to improve how groups of any size make decisions together. It does not promise perfect answers or universal agreement. It offers a structure for listening, deliberating, and deciding that aligns more closely with how people reason in practice.
            </p>
            <p className="text-subtle leading-relaxed mb-4">
              If collective decisions are becoming harder to make, not because people care less, but because our tools are misaligned with how humans reason, then new structures are worth exploring. Union Chant exists to explore one such structure. Not to replace judgment, but to support it. Not to end disagreement, but to refine it. Not to centralize power, but to make shared understanding visible.
            </p>
            <p className="text-subtle leading-relaxed font-medium text-foreground text-xl">
              Good decisions do not emerge from silence or noise. They emerge from conversation—given the right form.
            </p>
          </section>

          <hr className="border-border my-8" />

          <div className="text-center">
            <Link
              href="/demo"
              className="inline-block bg-purple hover:bg-purple-hover text-white px-8 py-3 rounded-lg font-semibold transition-colors mr-4"
            >
              Watch Demo
            </Link>
            <Link
              href="/deliberations/new"
              className="inline-block bg-accent hover:bg-accent-hover text-white px-8 py-3 rounded-lg font-semibold transition-colors"
            >
              Start a Deliberation
            </Link>
          </div>
        </article>
      </div>
    </div>
  )
}
