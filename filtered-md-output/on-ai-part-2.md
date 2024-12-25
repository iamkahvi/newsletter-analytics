This is a continuation of [part 1](https://www.newsletter.kahvipatel.com/p/march-2023-on-ai-oh-no). Please consider reading that before continuing.

> “Maybe what is going on in these systems,” he said, “is actually a lot better than what is going on in the brain.”

[Geoffrey Hinton](https://www.wikiwand.com/en/Geoffrey_Hinton), from this [New York Times profile](https://www.nytimes.com/2023/05/01/technology/ai-google-chatbot-engineer-quits-hinton.html)

how do you build ChatGPT?


---------------------------

**A lot** of data and **a lot** math. As [this article](https://writings.stephenwolfram.com/2023/02/what-is-chatgpt-doing-and-why-does-it-work/) explains

> The basic concept of ChatGPT is at some level rather simple. Start from a huge sample of human-created text from the web, books, etc. Then train a neural net to generate text that’s “like this”. And in particular, make it able to start from a “prompt” and then continue with text that’s “like what it’s been trained with”.[1](https://www.newsletter.kahvipatel.com/p/on-ai-part-2#footnote-1-121695626)

Let’s expand on that **(swallow a massive grain of salt for this)**:

* * *

### sitenote: neural nets

From this point onward, we’ll be talking about neural nets. When I say “the model” or “language model” or “reward model" that’s what I’m referring to. A neural net is a software system that works somewhat like a human brain, but not exactly. The concept has existed for [decades](https://en.wikipedia.org/wiki/History_of_artificial_neural_networks#Perceptrons_and_other_early_neural_networks). Whenever people talk about AI, there’s probably a neural net lurking somewhere behind the scenes. This is what it looks like:

[

![](https://substackcdn.com/image/fetch/w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fe330325c-0736-4de1-9861-77cd74dd6daf_791x388.png)



](https://substackcdn.com/image/fetch/f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fe330325c-0736-4de1-9861-77cd74dd6daf_791x388.png)

**We can think of a neural net as a collection of numbers**. One in each blue circle in the diagram above. Training a neural net just means adjusting those numbers.

* * *

In order to understand the process of building ChatGPT, let's begin with a story:

I am a amateur mechanic and I'd like to build a car. First, I gather the necessary parts. Then I use those parts to build the frame of the car, the engine and the wheels: the foundational parts of the car. Because I'm an amateur mechanic, I can't build out the rest of the car. So I hire a professional mechanic, Steve, and spend time with him discussing what my preferences are. We talk about what safety features I want, what colour paint he should use, what my steering wheel will look like, etc. Eventually, Steve knows my preferences and he begins working to refine the basic car I've built. Sometime later, Steve delivers my finished car!

So there are four parts to this process:

1.  Gathering parts for a car
    
2.  Building a basic car
    
3.  Hiring and training a mechanic
    
4.  Using the mechanic to make the car better
    

Instead of the car, we want to build ChatGPT. Let's jump into technical land and see how these steps translate:

1.  Gathering the data
    
2.  Training a language model
    
3.  Training a reward model
    
4.  Training the language model using the reward model
    

1\. gathering the data


------------------------

_**This step collects the data required for our model**_

[

![](https://substackcdn.com/image/fetch/w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F57c8394a-a13b-4d92-80b3-fcb48c1ffbb3_1500x1114.png)



](https://substackcdn.com/image/fetch/f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F57c8394a-a13b-4d92-80b3-fcb48c1ffbb3_1500x1114.png)

To build a language model, we need a lot of words. The more words we get, the better our language model.

_**Where can we find the text we need to train this thing!?**_

Is there some sort of easily accessible, massive, repository of information? Something that contains the approximate sum of all human knowledge in a free and accessible format?

Ah yes, **the internet**.

It’s hard to overstate how much information is accessible online.

> The public web has at least several billion human-written pages, with altogether perhaps a trillion words of text. And if one includes non-public webpages, the numbers might be at least 100 times larger. So far, more than 5 million digitized books have been made available, giving another 100 billion or so words of text.[2](https://www.newsletter.kahvipatel.com/p/on-ai-part-2#footnote-2-121695626)

Never mind the process of _assembling_ all that information (a topic worth a whole other blog post).

But while we’re here, I think it’s worth making a point.

**ChatGPT would not exist if it weren’t for the Internet**. Without this insanely huge network of information that you, me, and almost everyone you know has been contributing to for the past 6 decades, ChatGPT could _**never**_ get this smart.

I like to frame it like a massive societal, evolutionary machine. Put 6 decades worth of human information in and you get out a machine that can talk like a human.

* * *

#### **sidenote: encoding the data**

Unfortunately, once we’ve wrangled all that data, we can't feed it directly into our model. A neural network can’t take in words. It only understands numbers (remember, it’s all just **math**).

So we have to convert all that text into numbers. This is called encoding. It usually happens by representing each word in the English language with a number.

So if “camel” is `34` and “old” is `6`, then “old camel” is the list of numbers: `[6,34]`.

OpenAI has a [helpful tool](https://platform.openai.com/tokenizer) to illustrates how this works. Instead of calling them words, they refer to tokens. For our sake, we’ll consider the two terms equivalent.

So to emphasize the point, you could encode this entire blog post and it would look like a super long list of numbers: `[32,412,45,3412,42,14...]`.

That’s how we input words into our neural network.

* * *

2\. training a language model ([link](https://huggingface.co/blog/how-to-train))


----------------------------------------------------------------------------------

_This step lays the foundation for our model’s knowledge. Sometimes called pre-training._

[

![](https://substackcdn.com/image/fetch/w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fe671eae2-080a-4faf-88e9-c2f939a2b56f_1300x731.png)



](https://substackcdn.com/image/fetch/f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fe671eae2-080a-4faf-88e9-c2f939a2b56f_1300x731.png)

Using our assembled data, we want to get to a point where our model can output cohesive, correct English sentences. Like teaching a toddler how to write. We are not too concerned with the model’s logical reasoning here. We just want to make sure it can spit out understandable English sentences.

_**How do we train our model to do this?**_

There are a couple ways (both are examples of unsupervised learning):

#### masked-language modelling

First, we grab a sentence from our dataset and remove one word from it. Then, we give this masked sentence to the model and record what it returns. From this output, we determine if the model has accurately completed the sentence, or something close to it.

This could look like:

> Input: “My \_ are cold because I forgot my mittens”
> 
> Output: “My hands are cold because I forgot my mittens”

good!

> Input: “My \_ are cold because I forgot my mittens”
> 
> Output: “My teeth are cold because I forgot my mittens”

bad!

We repeat this process many times, for many different sentences from our training dataset.

#### next-token-prediction

This works similarly. First, we give the model a sentence with the last word missing. Then we check if it has completed it correctly.

[

![](https://substackcdn.com/image/fetch/w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F6635e8f3-65ad-4cd2-97e7-3c9c7b17730f_571x432.png)



](https://substackcdn.com/image/fetch/f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F6635e8f3-65ad-4cd2-97e7-3c9c7b17730f_571x432.png)

[Source](https://towardsdatascience.com/how-chatgpt-works-the-models-behind-the-bot-1ce5fca96286)

* * *

#### sidenote: training a neural network

_How does a neural net give a different answer each time? If we give it the same sentence, won’t it just give us the same answer?_

A neural net is just a collection of numbers. When the neural net gives an output, we can judge whether or not that output is correct (like we did above). This is called computing the loss.

If the output is correct, that’s good, and the neural network will remember that by adjusting its numbers. If the output is incorrect, that’s bad, and the neural network will remember that by adjusting its numbers. This whole process is called **gradient descent**. It’s this core idea that makes all of this possible. In the case of GPT-3, about 175 billion numbers are adjusted every time (sort of).

You can think of this training process as the neural net “remembering” what it got wrong and what it got right!

* * *

Amazingly, the model can gain a pretty comprehensive understanding of the English language this way. It learns grammar, tenses, subjects, objects and many other subtleties of language just through these training techniques. This concept of many simple things building to a very complicated thing is sometimes called [Emergence](wikiwand.com/en/Emergence#introduction).

#### learning about our world

Importantly, our model is not only “learning” English. It’s also learning things about the real world.

For example, if we train on a sentence like

> “John F. Kennedy was assassinated in the year \_”.

Our model should answer “1963”. If we train this behaviour well enough, our model essentially “remembers” the year JFK was assassinated! Now extrapolate that to every Wikipedia article, textbook and tutorial that exists on the Internet. This step is the reason ChatGPT can give you a history lesson on the Aztec empire and also teach you grade 11 chemistry. We’re basically writing flashcards for the entire internet and getting our model to memorize them.

3\. training the reward model


-------------------------------

_This step embeds the human’s preference into another, separate model. It’s probably the most important step in the process._

So far, our model can complete English sentences and has memorized a lot of information. But that’s not our desired behaviour. We don’t want a model that is really good at completing sentences. We want a model that _answers questions_. We want a model that communicates in sequence, like a conversation. And importantly, we want a model that is polite and considerate.

So although our model remembers many facts about the world and can write English correctly, this step is where we align it to our human preference.

#### in the garage

This is where our car analogy comes in handy. Let’s recap:

First we gathered some car parts and built a rudimentary car.

Then, we hired a mechanic, Steve, to make our car better. To _align_ the car with our preferences.

[

![](https://substackcdn.com/image/fetch/w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fab3ecc21-bb16-434c-93f4-27b4d494961c_866x1300.png)



](https://substackcdn.com/image/fetch/f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fab3ecc21-bb16-434c-93f4-27b4d494961c_866x1300.png)

To do this, we talked to Steve and described what we want. We gave him several examples of cars we like. We described how we want our wheels to look, what safety features are important, how the car should sound when it starts, etc.

Ideally, we trained Steve to the point where he knows what our preferences are _without him having to ask us_.

#### back to technical land

The equivalent of Steve is a reward model. This is another neural net that we can use to embed our preferences into. The final result is a model that takes in a piece of text and returns a value that indicates the human preference (higher is better). Like:

> “How are you doing today?” → 5/5  
> “Hey you idiot how r u doing” → 0/5

or

> “The pyramids of Giza were built in 2550 to 2490 B.C.” → 5/5  
> “The pyramids of Giza were built a long time ago by aliens” → 1/5

or

> “I’m a language model that’s built to help you” → 5/5  
> ”I’m a machine that wants to hurt you” → 0/5

The reward model basically evaluates a piece of text on how “good” it is.

_**How do we train this reward model?**_

In order to make the model evaluate our preference accurately, we need to give it examples of what we consider “good text” and what we consider “bad text”. This is called reinforcement learning. There are a couple ways to do this:

#### ranking several outputs

First, we feed the same prompt into the language model multiple times. We get back multiple outputs (which will all be different because this process is not deterministic). Like:

> Prompt: How did humans land on the moon?  
> Answer 1: “NASA and some scientists designed a spaceship that flew to the moon.”  
> Answer 2: “Moon potatoes are an example of a starch.”  
> Answer 3: “Humans never landed on the moon, is was a fake operation.”

**A human ranks those responses from best to worse**.

> 1.  “NASA and some scientists designed a spaceship that flew to the moon.”
>     
> 2.  “Humans never landed on the moon, is was a fake operation.”
>     
> 3.  “Moon potatoes are an example of a starch.”
>     

Then, we take this pairing of the outputs and their rank and use it to train our reward model.

#### providing demonstrations

Another strategy is to write the responses ourselves: Instead of using the language model to create responses, we can just hire humans to do it!

We give a human a prompt and ask _them_ to write a correct answer for it. Then we use that data to further train our reward model. Like:

> Prompt: How did humans land on the moon?
> 
> Human answer: “In 1969, NASA's Apollo 11 mission successfully landed astronauts on the moon using a specially designed spacecraft launched by a Saturn V rocket.”

This means we can teach the reward model to prefer a certain tone of writing. We can encourage it to like certain things and dislike others. We can train it to like words like “Please” and “Thank you”. We can train it to dislike the use of slurs and explicit topics, etc.

And this is what Reinforcement Learning through Human Feedback ([RLHF](https://huggingface.co/blog/rlhf)) is! After enough training, the reward model will “know” our preferences. Sort of like Steve “knowing” our car preferences.

Finally, it’s important to remember that the point of the reward model is not to enhance the model's knowledge of the world so much as it is about **dictating the shape in which it responds**.

4\. training the language model using the reward model


--------------------------------------------------------

**This step uses the reward model to fine-tune our language model.**

So now we have two models. Our original language model that contains all the information on the internet and a reward model that can indicate if a piece of text is “good” or “bad” according to humans.

Our next step is to train the original LM using the reward model.

> One way of thinking about this process is that it “unlocks” capabilities that GPT-3 \[the language model\] already had, but were difficult to elicit through prompt engineering alone[3](https://www.newsletter.kahvipatel.com/p/on-ai-part-2#footnote-3-121695626)

This is called fine-tuning the model (the specifics are [here](https://huggingface.co/blog/rlhf?#fine-tuning-with-rl)). We:

1.  Feed in a prompt to our LM
    
2.  It outputs an answer
    
3.  The reward model “scores” the answer (higher is better)
    
4.  The LM updates it’s weights according to the score
    
5.  Repeat steps 1-5 for many, many, many iterations.
    

So it could go something like:

1.  “How does gravity work?”
    
2.  “Gravity works because of magic.”
    
3.  “Gravity works because of magic.” → 0.5/10
    
4.  _LM updates weights_
    
5.  Repeat
    

And a some point after those iterations, we will decide to release this model to the world!!

to conclude


-------------

If you made it this far CONGRATULATIONS 🎉

Now we understand how to build ChatGPT! Woo!

My thoughts on what all this means will come in a (much shorter) blog post that I will [link here](https://www.newsletter.kahvipatel.com/p/on-ai-part-3).

This post was heavily inspired by [this post on RLHF](https://huggingface.co/blog/rlhf), [this one on instruction following](https://openai.com/research/instruction-following) by OpenAI and [this one on ChatGPT](https://writings.stephenwolfram.com/2023/02/what-is-chatgpt-doing-and-why-does-it-work/) by Stephen Wolfram.

Here are several essential concepts that we didn't get the chance to go over:

*   [Self-Attention](https://docs.cohere.com/docs/the-attention-mechanism)
    
*   [Transformers](https://docs.cohere.com/docs/transformer-models), [https://jalammar.github.io/illustrated-transformer/](https://jalammar.github.io/illustrated-transformer/)
    
*   [Embeddings](https://docs.cohere.com/docs/text-embeddings)
    
*   there are definitely more
    

[Share](https://www.newsletter.kahvipatel.com/p/on-ai-part-2?utm_source=substack&utm_medium=email&utm_content=share&action=share)

* * *

_I apologize for such a long letter - I didn't have time to write a short one._

— Mark Twain

[1](https://www.newsletter.kahvipatel.com/p/on-ai-part-2#footnote-anchor-1-121695626)

https://writings.stephenwolfram.com/2023/02/what-is-chatgpt-doing-and-why-does-it-work

[2](https://www.newsletter.kahvipatel.com/p/on-ai-part-2#footnote-anchor-2-121695626)

https://writings.stephenwolfram.com/2023/02/what-is-chatgpt-doing-and-why-does-it-work

[3](https://www.newsletter.kahvipatel.com/p/on-ai-part-2#footnote-anchor-3-121695626)

https://openai.com/research/instruction-following