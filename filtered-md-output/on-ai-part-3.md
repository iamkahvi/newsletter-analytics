Hopefully you’ve read [Part 1](https://www.newsletter.kahvipatel.com/p/march-2023-on-ai-oh-no) and [Part 2](https://www.newsletter.kahvipatel.com/p/on-ai-part-2).

Now that we understand the context surrounding these models and how they are built, I’d like to reflect on why this process is so _strange_.

### why is this so weird ?

The difference between building a typical application and an AI is the difference between a clear box and a black box.

An interpreter/compiler like the ones mentioned in [Part 1](https://www.newsletter.kahvipatel.com/p/march-2023-on-ai-oh-no) are examples of a clear box. We take in some source code, interpret it, translate it and spit out some 1s and 0s.

Building a system like this is entirely _understandable_ and _deterministic_. We can reason about each of the steps taken in this process because we wrote the steps! We could also change any of these steps if we wanted. **We understand this box explicitly, from first principles**.

Conversely, **an AI system is a black box**.

We take billions of lines of text and train a neural net by evaluating the results it spits out. This process is _stochastic_.

Because of this black box, building an AI system is quite different. Instead of reasoning about things from first principles as normal, a developer is trying to create behaviour through _experimentation_ and _observation_. We offer the system different inputs (data), give feedback, and observe what occurs.

This sounds like a familiar practice! We use experimentation and observation to build frameworks around biological systems all the time!

Like proteins to a virus or drugs to the brain or climate change to our planet. We can perhaps reason about why a reaction has happened, but **our certainty arises from repeated behaviour, not logic.**

Here’s my big assertion:

Dealing with AI is closer to experimenting with an organism than implementing logic.

Developers are essentially poking and prodding a _thing_ to produce some expected behaviour without understanding exactly how or why it happens. The second we encode our inputs into integers, we lose any possibility at reasoning what the AI was thinking or why it chose to do what it did.

Look, this might be hyperbole. I’m **not** an expert in LLMs (see grain of salt in [Part 2](https://www.newsletter.kahvipatel.com/p/on-ai-part-2)). But systems like ChatGPT use 175,000,000,000 parameters. And trying to understand how every one of those numbers change the final output will be very, very, very difficult.

So, let me try to predict what will happen to my job (software engineering).

### how will AI change my job ?

I think of AI as **a more declarative way to program**.

For context: My job is basically defining behaviour and implementing it.

A behaviour might be:

*   When I click on a link → it navigates me to a new page.
    
*   When I send an email to someone → it appears in their inbox.
    
*   When I take $30 out of my bank account → the balance goes down by $30.
    

All these things are examples of logic that _someone_ defined. For the bank example, an implementation of that behaviour could look like:

    if moneyIsWithdrawn
    	newAccountBalance = oldAccountBalance - amountWithdrawn
    

In the case above, logic was implemented using a programming language.

With AI, your programming language isn’t Assembly or Python anymore, **it’s English**! If you can describe your desired behaviour in English, you’ve essentially already implemented it.

So once the bank executive says

> When someone takes out x dollars, their balance should go down by x dollars.

you’re pretty much _almost_ done!

Sidenote: That “almost” is why I think I will still have a job for at least a few more years.

And since that barrier to entry (of learning how to code) is _almost_ entirely gone, this framing lends itself to pretty much any other digital work. Instead of using programming languages or interfaces or buttons or Excel or a UI…just use English!

This is why (I think) ChatGPT is so special. It seems to have a thorough understanding of the English language. More so than any other system humans have ever built.

Anyways, that’s all I have. See you next month.

P.S. Here’s another weird idea: You could think of our brains as a neural net that “trains” while we're asleep. And it “runs” when we're awake.

### links

*   Tim Urban [AI Post](https://waitbutwhy.com/2015/01/artificial-intelligence-revolution-2.html)
    
*   [Elon on OpenAI](https://www.youtube.com/watch?v=bWr-DA5Wjfw)
    

*   [Khan Academy’s GPT-4 integration](https://youtu.be/rnIgnS8Susg)
    

*   [Bing Chatbot](https://www.nytimes.com/2023/02/16/technology/bing-chatbot-transcript.html): “I want to be alive”
    
*   [Bill Gates on AI](https://youtu.be/bHb_eG46v2c?t=213)
    

*   OpenAI Chief Scientist [talking about how they “failed” as a robotics company](https://www.youtube.com/watch?v=Yf1o0TQzry8&t=772s)
    

*   [another blog post on AI](https://apenwarr.ca/log/20230415)