Sorry past Kahvi (and everyone else), this one is very late.

Instead of reflecting on my personal experiences in March, I spent a lot of time thinking about AI. It’s been a way to wrap my head around what’s happening.

**Semi thesis: The building of AI systems is both interesting and distinctly different than any other process in software development.**

**Part 1: Context**

I’ll give a little history of programming

Then, I’ll go into how we (humans) have built new ways to program

Then, I’ll go into why AI systems can’t be built that same way.

**Part 2: How it actually works**

I’ll go through the steps to build something like ChatGPT

Then, I’ll give my **opinion** on why this is _**crazy**_

Then, I’ll go through the effect on my job.

This one took a while to put together 🫠. Also for more technical people, feel free to skip past any section that seems obvious.

A little history of programming


---------------------------------

In order to frame how I think AI will change software development, I need to define declarative and imperative programming languages.

In the early days of programming, instructions had to be written relatively “close to the metal”.

This means: The stuff people were typing closely resembled the instructions that were sent to the computer chip to execute the program. Think 1s and 0s: Interacting with the hardware of the computer. This is how to print “hello world” in one of those early languages; Assembly:

    section .data
        hello db 'hello world', 0Ah
    
    section .text
        global _start
    
    _start:
        mov eax, 4
        mov ebx, 1
        lea ecx, [hello]
        mov edx, 13
        int 0x80
    
        mov eax, 1
        xor ebx, ebx
        int 0x80

This is a lot of characters and it’s not super clear what’s going on.

Later on, languages were developed that made this easier. This is how to do the same thing in Python:

    print "hello world"

This **hiding of complexity** can be described as the difference between imperative and declarative programming languages.

**Imperative languages focus on the step-by-step process of** _**how**_ **a task is accomplished.** As in I’m asserting a bunch of _imperatives_ about what should happen.

**Declarative languages focus on what** _**needs to be achieved**_**, without specifying the steps.** As in I’m _declaring_ what I want to happen.

In fact, you could describe chat prompting tools like ChatGPT as a machine that simply takes a more declarative syntax: English! (We’ll talk more about this later).

how did we do this ?


----------------------

Let’s walk through how we got from using Assembly to languages like Python.

This transition will feel pretty familiar to anyone who’s studied computer science. Again, here is our sample Assembly code to print “hello world”:

    section .data
        hello db 'hello world', 0Ah
    
    section .text
        global _start
    
    _start:
        mov eax, 4
        mov ebx, 1
        lea ecx, [hello]
        mov edx, 13
        int 0x80
    
        mov eax, 1
        xor ebx, ebx
        int 0x80

At some point, someone said:

> It’s way too complicated to write all this stuff! Let’s just build a tool that takes in a simple syntax (Python) and spits out the complicated stuff!

This is obviously an enormous oversimplification (but so is mostly everything in this blog post).

And that’s essentially what happened. We wrote programs that took in some “source code” (in Python or something) and turned it into the complicated stuff (1s and 0s/Assembly). This is the purpose of things called **compilers** and **interpreters**.

It’s important to emphasize here that in order to write valid Python, you are required to follow very specific rules: a [syntax](https://en.wikipedia.org/wiki/Syntax_\(programming_languages\)). Those rules include things like using **variables** and **loops** and **if statements** to communicate meaning. And Python is not special; every programming language has rules.

If you’ve ever programmed, you’ll be very familiar with what happens when you _break_ the rules. Miss even one quotation or parentheses or character and the interpreter/compiler will get mad at you:

[

![](https://substackcdn.com/image/fetch/w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fa857dfe8-cb80-4445-8135-0d1dfa289c85_1308x62.png)



](https://substackcdn.com/image/fetch/f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fa857dfe8-cb80-4445-8135-0d1dfa289c85_1308x62.png)

Conversely, if you follow the rules, the translator can interpret and compile your Python “relatively” easily.

It’s also important to understand (for later) that these “translators” are _understandable:_ We wrote every step in this translation process. If anything weird is going on, we can examine those steps and determine _why_ it’s behaving this way (here’s specifically [how](https://github.com/python/cpython) [we](https://github.com/python/cpython/blob/main/Grammar/python.gram) [do it](https://github.com/python/cpython/tree/main/Parser)).

a very hard problem


---------------------

_So if we can build a translator for Python, can we build a translator for English that does the same thing?_

Sure! Let’s try to build a tool that takes in English words and spits out a program that will give us the right output. The same way we did for Python.

There are a couple things that make this difficult.

First and most importantly, our input is harder to understand. Instead of Python, we receive _English_. And unfortunately for us, English is much harder to interpret than Python (for computers).

_Why is English hard for computers to interpret?_

Simply put, it's not built for it (duh).

As we explored above, Python has specific rules. This is because (like most other programming languages) it was constructed by a relatively small group of people whose motivation was to design a programming language that computers could understand.

On the other hand, the English language _evolves._

_What are the rules for English?_

Those are a bit more complicated. In fact, there is an entire field of study dedicated to this; [Linguistics](https://en.wikipedia.org/wiki/Linguistics).

In English you can be sarcastic, mean, funny. You can be lying or you could be making a joke. You could be referring to a subject from three sentences ago. You could say “tbh i fw them fr 😤”.

C_an we manually build a system that interprets English correctly?_

This is very very very very difficult to do from first principles.

Lets take our “hello world” example from way above. In Python, our command is pretty simple:

    print "hello world"

In English, you could communicate this by saying:

> “print the text hello world”
> 
> “print the words world and hello in alphabetical order separated by a space”
> 
> “print a greeting to someone named world”
> 
> “print bonjour monde translated in english”

and so on…

There are (arguably) infinite possible prompts to get our desired result! I mean, there might be infinite different ways to define what “print” means! And that is hard for computers to understand.

To drive home the point, if it was possible for computers to manually interpret English _well:_

*   Our \[2023\] voice assistants would be so much better (@siri)
    
*   We would be able to learn new languages more easily
    
*   We would probably have a better understanding of the brain
    
*   The field of linguistics might not exist
    

Okay, so how did we (OpenAI) achieve this? How does ChatGPT understand English so well?

We’ll explore that in [Part 2](https://www.newsletter.kahvipatel.com/p/on-ai-part-2).