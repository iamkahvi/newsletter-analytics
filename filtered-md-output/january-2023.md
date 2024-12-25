hola

Being sick


------------

I was sick for the last week of January. Nothing serious, just a head cold that left my nose stuffed up and gave me the occasional headache.

It's ironic because I've spent the past month focused on nose breathing. I talked about it for like 25% of [last month’s newsletter](https://www.newsletter.kahvipatel.com/p/december-2022).

I can’t help but think I've somehow caused myself to get sick? Like since more air is coming in through my nose I accidentally sucked up a virus? A virus that is particularly potent through the nose?

This bout of sickness has also convinced me that Burt’s Bees lip balm is purposefully _meant_ to dry out your lips. I remember this being a [John Mulaney take](https://youtu.be/pUgwTkDhgbo?t=2365). My lips feel dry and cracked and terrible a few minutes after each use. It perpetuates a vicious cycle.

Home network setup


--------------------

I spent some time this month trying to setup my [Raspberry Pi](https://www.canakit.com/raspberry-pi-4-starter-kit.html) on our home network. Specifically, I bought [this router](https://www.tp-link.com/ca/home-networking/wifi-router/archer-ax73/) in order to manually configure a primary DNS server (something that the router/modem Shaw gave us does not let you do 😡).

In semi-chronological order, I

*   setup a DNS server with [Adguard](https://adguard.com/en/adguard-home/overview.html) on the pi
    
*   setup nginx on the pi
    
*   setup custom DNS rewrites (like [kahvi.server.com](http://kahvi.server.com)) on Adguard
    
*   pointed nginx to the DNS rewrites
    

All this means is that if you try and go to [kahvi.server.com](http://kahvi.server.com) on the normal internet, you’ll get something like this:

[

![](https://substackcdn.com/image/fetch/w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F4816fefe-1c0a-47a1-9469-098742e7a82b_1994x1972.png)



](https://substackcdn.com/image/fetch/f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F4816fefe-1c0a-47a1-9469-098742e7a82b_1994x1972.png)

_But_ if you come over and connect to our home network, you’ll see this when you go to [kahvi.server.com](http://kahvi.server.com):

[

![](https://substackcdn.com/image/fetch/w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F561474f9-c6f8-4dfd-afb1-a3503fae22f9_1994x1972.png)



](https://substackcdn.com/image/fetch/f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F561474f9-c6f8-4dfd-afb1-a3503fae22f9_1994x1972.png)

It only exists on our local network! It’s like our apartment’s secret little website.

_But wait, what is that ugly looking website anyways?_

It’s a fileserver for pretty much every (digital) book I have. So you can browse and download at your leisure. A home library of sorts. Except a lot uglier and with no paper.

Normal People


---------------

I was enamoured with the show _Normal People_ for a while this month. Partly because of my infatuation with the Irish language and culture in general. Their’s is my favourite accent.

I also enjoyed the show because of Marianne and Connel’s relationship (obviously).

Despite the show’s attempts to convince you otherwise, you get the message pretty quickly that the two are _soulmates._ And as a viewer, you draw comfort from that certainty; it makes watching the show much easier since the conclusion seems inevitable.

It’s also misleading because infallible, 100% certainty rarely exists in real life or relationships. But it’s a pleasant form of escapism, despite some of the more serious subject matter (depression, abuse, etc).

Additionally the sex scenes are really well done. I haven’t seen anything like it before. Having an [intimacy coordinator](https://www.vulture.com/2020/04/normal-people-good-sex-scenes.html) on set and intricate choreography really paid off. To quote the [Vulture article](https://www.vulture.com/2020/04/normal-people-good-sex-scenes.html):

> Normal People has managed to do the seemingly impossible: convey good sex as it actually happens in real life, not good sex as it happens onscreen.

Links


-------

*   this [cool game](https://www.chronophoto.app/game.html)
    
*   this [song](https://www.youtube.com/watch?v=SSrsj1rBE8Q) and this [song](https://youtu.be/JKEItVNlYXI) and this [song](https://www.youtube.com/watch?v=l4UkYBr1NnA)
    
*   this helpful decision flow diagram (thanks [wealthsimple](https://www.wealthsimple.com/en-ca/magazine/rrsp-vs-tfsa-tax-canada))
    
    [
    
    ![](https://substackcdn.com/image/fetch/w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F2a596cde-690a-4441-a40d-bae3c0be0783_1490x4070.png)
    
    
    
    ](https://substackcdn.com/image/fetch/f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F2a596cde-690a-4441-a40d-bae3c0be0783_1490x4070.png)
    

*   this [article](https://messaging-custom-newsletters.nytimes.com/template/oakv2?campaign_id=50&emc=edit_cnda_20230204&instance_id=84519&nl=canada-letter&productCode=CNDA&regi_id=77145288&segment_id=124418&te=1&uri=nyt%3A%2F%2Fnewsletter%2Fb31d0b3b-00a8-596e-a845-0ee10b3a88a6&user_id=502341a504dc61a036278a69ed0a52f6) about the [recent](https://www.bccourts.ca/jdb-txt/sc/22/00/2022BCSC0049.htm?campaign_id=50&emc=edit_cnda_20230204&instance_id=84519&nl=canada-letter&regi_id=77145288&segment_id=124418&te=1&user_id=502341a504dc61a036278a69ed0a52f6#_Toc92879288) [rulings](https://canlii.ca/t/jv6dc#par131) on the right of homeless people in Canada
    

More substack content!


------------------------

These are some newsletters I’ve been reading this month:

> Sometimes, in a quizzical tone, I ask myself why I have made my life so weird by moving here when I have plenty of deep, cozy relationships somewhere else. But then when I talk to the people who I’ve already known forever, I’m reminded why the pursuit and building of friendships is worthwhile.

[here](https://haleynahman.substack.com/p/131-what-do-we-do-about-the-friend/comments)

> Above all, my advice with complicated emotions like this is to give them time to develop and clarify before you apply a narrative…Not to make an impossibly firm decision based on murky fears, but to observe them without judgment, or jumping to solutions, no matter how tempting.

[here](https://haleynahman.substack.com/p/133-do-i-find-my-partner-attractive)

> This week I have witnessed a classic case of a celebrity home tour, an apartment that has unsettled my spirit. The home of David Harbour (no opinion) and Lily Allen ([ahem](https://twitter.com/lilyallen/status/1604903982589218832)  and [ahem](https://www.youtube.com/watch?v=g_dOt6CV9ds)) is dark energy manifested.

[here](https://hunterharris.substack.com/p/perhaps-the-david-harbour-lily-allen)

See you next month

Kahvi