# W E E K # 9
# Information Diffusion
# How ideas, behaviors, and viruses spread through networks
### C-DE422 Big Data Analytics II
### Social Network Analytics
Dr. Amany Eissa | Spring 2026

---

# Where We Are in the Course
Week 9 of 11 — heading into final projects
### 1
Intro
### 2
Graphs
### 3
Measures
### 4
Centrality
### 5
PageRank
### 6
Personalized PR
### 7
Communities
### 8
Link Pred.
### 9
Diffusion
### 10
Robustness
### 11
Projects
T O D A Y ' S L E C T U R E
### Independent Cascade ### · ### Linear Threshold ### · ### SIR / SIS ### · ### Influence Maximization
Three diffusion mechanics + the optimization problem they motivate.
Week 9 — Information Diffusion | C-DE422 SNA 2 / 40

---

# Learning Objectives
By the end of this lecture you will be able to...
# 1 ### Distinguish between mechanics and optimization in diffusion problems
# 2 ### Trace cascades by hand under both Independent Cascade and Linear Threshold models
# 3 ### Explain why IC is stochastic and LT is deterministic, and what that means
# 4 ### Identify when SIR vs SIS is the appropriate epidemic framework for a given problem
# 5 ### Articulate why high-degree seeding is suboptimal, and how greedy seed selection improves on it
Week 9 — Information Diffusion | C-DE422 SNA 3 / 40

---

# P A R T # 1
# Why Diffusion Matters

---

# A Thread Running Through the Whole Course
We have been quietly studying diffusion since week 1
W e e k 1 – 2
### Networks as channels
Networks as systems through which news, rumors,
and behaviors travel; bridges carry the spread.
W e e k 3
### Clustering
High clustering = efficient local sharing. Low
clustering = spread relies on hubs.
W e e k 4
### Betweenness
Important nodes are bridges over which information
flows between groups.
W e e k 5 – 6
### PageRank
Influence flows recursively through followers; PPR
measures relevance from a seed.
W e e k 7
### Communities
Within-community ties dense; between-community
ties are diffusion channels.
W e e k 8
### Link Prediction
Predicting future edges — the channels that future
cascades will travel along.
### Today: we make the spreading process itself the object of study.
Week 9 — Information Diffusion | C-DE422 SNA 5 / 40

---

# Why We Care: Four Real-World Stakes
Every domain below is a diffusion problem in disguise
## Viral Marketing
Pick a small set of seed customers who will spread a
product. Wrong seeds → no traction.
## Epidemic Control
Predict where infection spreads, decide who to
vaccinate first, estimate when peak hits.
## Misinformation
Track how rumors spread, identify super-spreaders,
design interventions that slow them.
## Behavior Adoption
Why do some products go viral while better ones fail?
Why does one neighborhood adopt solar?
Week 9 — Information Diffusion | C-DE422 SNA 6 / 40

---

# Mini Case Study: Hotmail (1996)
The first famous viral-marketing diffusion success
T H E P R O B L E M
Hotmail launched in 1996 with a tiny marketing budget and needed to
compete against established email providers. They could not afford TV or
print ads.
T H E T R I C K
Every outgoing email automatically appended: "PS: I love you. Get your
free email at Hotmail."
T H E R E S U L T
### 12 million users in 18 months
Total marketing spend: ~$50,000
Acquired by Microsoft for $400M in 1997.
W H Y T H I S I S A D I F F U S I O N P R O B L E M
Each new user becomes a sender → spreads to their contacts
→ some sign up → repeat.
This is exactly the cascade dynamic we will formalize today.
The key questions:
→ How fast does it spread?
→ How big does the cascade get?
→ Could we have predicted takeoff?
→ Who should we have seeded?
Week 9 — Information Diffusion | C-DE422 SNA 7 / 40

---

# P A R T # 2
# Two Big Questions

---

# The Field Splits Into Two Questions
Today we touch both, but most of the lecture is about mechanics
### M E C H A N I C S
# How does spreading work?
Given a network and a starting set of active nodes, predict the size
and shape of the cascade.
Models we will study:
### ■ ### Independent Cascade (IC)
### ■ ### Linear Threshold (LT)
### ■ ### SIR / SIS epidemic models
### O P T I M I Z A T I O N
# Who should we seed?
Given a budget of k seeds, find the seed set that maximizes the
expected cascade.
Topics:
### ■ ### The Influence Maximization problem
### ■ ### Why simple heuristics fail
### ■ ### The greedy algorithm
You need mechanics before optimization — you cannot maximize what you cannot predict.
Week 9 — Information Diffusion | C-DE422 SNA 9 / 40

---

# Common Setup for All Diffusion Models
Vocabulary you will need for the rest of the lecture
## ■ ## Network G = (V, E)
○ Set of nodes V and edges E. May be directed or undirected.
## ■ ## Node states
○ ACTIVE (or infected, adopted, informed)
○ INACTIVE (susceptible, has not adopted)
○ Some models add: RECOVERED, EXPOSED, etc.
## ■ ## Seed set S## ₀
○ The nodes that start active at time t = 0.
## ■ ## Cascade size σ(S## ₀## )
○ The total number of active nodes when the process ends.
S T A T E T R A N S I T I O N S
### INACTIVE
### ACTIVE
activates
In IC and LT, this is one-way: once active, always active.
Week 9 — Information Diffusion | C-DE422 SNA 10 / 40

---

# Our Worked-Example Graph
Same 7-node network used for IC, LT, and influence maximization
K E Y F A C T S
### 7 nodes, 8 edges
Single connected component
Hub: node E (degree 4)
Periphery: G (degree 1)
Why this graph?
Small enough to trace by hand. Has a hub, a periphery, and
a triangle-free structure that makes thresholds matter.
Week 9 — Information Diffusion | C-DE422 SNA 11 / 40

---

# P A R T # 3
# Independent Cascade Model

---

# The Independent Cascade (IC) Model
Goldenberg, Libai & Muller, 2001
T H E I D E A
### Each newly active node u gets one chance to activate each inactive
### neighbor v. Whether u succeeds is decided by an independent coin
### flip with success probability p(u,v).
T H E M E C H A N I C S
■ At t=0, the seed set S₀ is active.
■ When u becomes active at time t, in step t+1 it tries to activate each
currently inactive neighbor v exactly once.
■ Success: u activates v with probability p(u,v). Failure: v stays inactive
— and u never tries v again.
■ Process ends when no new activations happen in a round.
Week 9 — Information Diffusion | C-DE422 SNA 13 / 40

---

# Two Crucial IC Rules That Trip Up Beginners
Internalize these or your traces will be wrong
# 1 
### ONE-SHOT RULE
### A failed activation attempt is permanent. If u tries v and the
### coin says "fail," u never gets to try v again ### — ### even if u stays
### active forever.
W H Y I T M A T T E R S
Order of attempts matters. By the time an inactive node v finally
activates, several of its neighbors may have already tried and failed
— those channels are closed forever.
# 2 
### INDEPENDENCE RULE
### Every coin flip is independent of every other. Multiple newly-
### active neighbors of v each get a separate, independent
### attempt to activate v in the same round.
W H Y I T M A T T E R S
If two neighbors u₁ and u₂ both try to activate v, v becomes active if
at least one succeeds. So pressure builds: more active neighbors
→ higher chance v turns.
Week 9 — Information Diffusion | C-DE422 SNA 14 / 40

---

# Worked Example # — # IC on Our Graph
Seed = {A}. Edge probabilities shown. We use pre-specified coin flips for a deterministic classroom trace.
L E G E N D
Active
Newly active
Inactive
# ★ 
Seed
success
failed try
How is success/fail decided in practice? Draw a uniform random number r ∈ [0,1]. Success if r ≤ p, fail otherwise. We use fixed
coin outcomes here so the trace is reproducible — real runs vary.
Week 9 — Information Diffusion | C-DE422 SNA 15 / 40

---

# IC # — # Round 1: A attempts its neighbors
A is active. A's inactive neighbors are B and D. A flips a coin for each.
S T E P - B Y - S T E P
### A → B
p = 0.5, coin = SUCCESS
B activates this round.
### A → D
p = 0.4, coin = FAIL
D stays inactive. By the one-shot rule, A
will NEVER try D again.
End of round 1:
Active = {A, B}
Week 9 — Information Diffusion | C-DE422 SNA 16 / 40

---

# IC # — # Round 2: B attempts its neighbors
B (newly active) tries each inactive neighbor: C and E
S T E P - B Y - S T E P
### B → C
p = 0.3, coin = FAIL
C lost to B forever.
### B → E
p = 0.6, coin = SUCCESS
E activates this round.
Note: A does NOT try anyone this round. Only
newly-active nodes attempt.
End of round 2:
Active = {A, B, E}
Week 9 — Information Diffusion | C-DE422 SNA 17 / 40

---

# IC # — # Round 3: E attempts its neighbors
E (newly active) tries D, F, and G
S T E P - B Y - S T E P
E → D
p = 0.2, SUCCESS ✓
D activates via E (a different path than A→D,
which failed).
E → F
p = 0.4, FAIL ✗
E → G
p = 0.7, SUCCESS ✓
End of round 3:
Active = {A, B, D, E, G}
Week 9 — Information Diffusion | C-DE422 SNA 18 / 40

---

# IC # — # Cascade Ends
D and G have no inactive neighbors → no more attempts → cascade ends
F I N A L O U T C O M E
# 5 / 7
### nodes activated
A C T I V E
### A, B, D, E, G
I N A C T I V E
### C, F
← lost to failed attempts
Week 9 — Information Diffusion | C-DE422 SNA 19 / 40

---

# IC Is Stochastic # — # Different Runs Give Different Outcomes
We just saw ONE realization. The same seed could produce many different cascades.
W H A T T H I S M E A N S
### With the same graph, same probabilities, same seed {A}, we could get cascades of size 1, 2, 3, ... up to 7. Each outcome has some
### probability.
### Lucky run
# 7/7
All coins land right → full network activated
### Our run
# 5/7
Mixed outcomes — what we just traced
### Unlucky run
# 1/7
A→B and A→D both fail → cascade dies
immediately
### Key consequence: to compare seed sets, we run many simulations and compare the EXPECTED cascade size.
Week 9 — Information Diffusion | C-DE422 SNA 20 / 40

---

# P A R T # 4
# Linear Threshold Model

---

# The Linear Threshold (LT) Model
Granovetter, 1978 — different intuition from IC
T H E I D E A
### A node v adopts when ENOUGH of its neighbors have already
### adopted. Each neighbor exerts a fixed amount of influence; v has a
### personal threshold for how much pressure it needs to flip.
T H E I N G R E D I E N T S
### ■ ### Edge weight b(u,v)
○ How much influence neighbor u exerts on v. Sum over u must be ≤ 1.
### ■ ### Threshold θᵥ ### ∈ ### [0, 1]
○ How much total pressure v needs in order to activate.
### ■ ### Activation rule
○ v activates when Σ b(u,v) ≥ θᵥ, summed over active neighbors u.
I N T U I T I O N : P E E R P R E S S U R E
# v
θ = 0.5
### u### ₁ ### u### ₂
0.3 0.4
### u### ₃ ### u### ₄
0.2 
0.1
Pressure on v = 0.3 + 0.4 = 0.7 ≥ θ = 0.5 ✓
v activates
Week 9 — Information Diffusion | C-DE422 SNA 22 / 40

---

# LT vs IC # — # How Are They Different?
Same diffusion theme, very different mechanics
# IC
Sender-driven | Stochastic
■ Active node u rolls a coin to push to each neighbor
■ Each push is one-shot — fail and that channel is closed
■ Random outcome — same setup gives different runs
■ Mental model: pandemic, viral content, gossip
■ Multiple active neighbors → multiple independent shots at v
■ Best for: contagion-like, low-commitment spreading
# LT
Receiver-driven | Deterministic
■ Inactive node v sums up pressure from active neighbors
■ v flips the moment cumulative pressure ≥ θᵥ
■ Deterministic given thresholds — same setup gives same result
■ Mental model: technology adoption, peer pressure, social proof
■ Pressure literally adds: pressure(v) = Σ b(u,v) over active u
■ Best for: decisions requiring conviction or social validation
Week 9 — Information Diffusion | C-DE422 SNA 23 / 40

---

# LT Setup on Our Graph
Standard textbook setup: weight from u to v is 1/deg(v) — incoming weights at v sum to exactly 1
T H R E S H O L D S
### A θ = 0.5 (deg 2)
### B θ = 0.4 (deg 3)
### C θ = 0.6 (deg 2)
### D θ = 0.4 (deg 2)
### E θ = 0.5 (deg 4)
### F θ = 0.7 (deg 2)
### G θ = 0.5 (deg 1)
Each neighbor of v contributes 1/deg(v) of pressure.
Seed = {A}. Same seed as IC.
Where do thresholds come from? Drawn randomly in theory studies, learned from data in empirical work, or — as
here — chosen for a clean classroom example.
Week 9 — Information Diffusion | C-DE422 SNA 24 / 40

---

# LT # — # Round 1: Compute pressure on each inactive node
Active = {A}. For each inactive v, count active neighbors and divide by deg(v).
P R E S S U R E C H E C K
B: 1 active nbr / deg 3
= 0.333 vs θ = 0.4
✗ Not enough pressure
D: 1 / 2 = 0.500
vs θ = 0.4
✓ D ACTIVATES
C, E, F, G:
no active neighbors yet
End of round 1:
Active = {A, D}
Week 9 — Information Diffusion | C-DE422 SNA 25 / 40

---

# LT # — # Round 2: Recheck. Cascade ends.
D is now active. Recompute pressure on every still-inactive node.
R E C H E C K
B: still 1/3 = 0.333
(D is not B's neighbor)
✗ still below 0.4
E: 1/4 = 0.25 (from D)
vs θ = 0.5
✗ still below threshold
Nobody flips this round
→ CASCADE ENDS
Final: {A, D}, size 2/7
Week 9 — Information Diffusion | C-DE422 SNA 26 / 40

---

# Same Graph, Same Seed, Very Different Outcomes
IC reached 5/7; LT reached only 2/7. Why the gap?
### The key insight: IC needs one good roll to keep going. LT needs enough committed neighbors to convert. Different physics → different
cascades.
Week 9 — Information Diffusion | C-DE422 SNA 27 / 40

---

# P A R T # 5
# Epidemic Models # — # SIR & SIS

---

# Why a Different Family of Models?
IC and LT are great for one-shot adoption. But many phenomena are not one-shot.
# IC / LT
"Once active, always active"
■ Adoption is permanent
■ Two states: active / inactive
■ Cascade ends at some point
■ Time index is discrete rounds
■ Examples: bought a product, signed up for a service
# EPIDEMIC
"State can change over time"
■ Nodes can recover, become re-susceptible, etc.
■ Multiple compartments: S, I, R (and more)
■ Infection has duration — γ governs recovery rate
■ Continuous time (ODE) or discrete (network sim)
■ Examples: flu, COVID, the spread of a hashtag
Week 9 — Information Diffusion | C-DE422 SNA 29 / 40

---

# The Two Classic Compartmental Models
SIR and SIS — same basic idea, different recovery dynamics
# β 
### Transmission rate
How fast S contacts spread infection.
Higher β → faster outbreak.
# γ 
### Recovery rate
How fast I individuals recover.
1/γ is the average infectious period.
# R# ₀ 
### Basic reproduction #
R₀ = β / γ. If R₀ > 1, outbreak grows;
if R₀ < 1, it dies out.
Week 9 — Information Diffusion | C-DE422 SNA 30 / 40

---

# SIR: The Classic Outbreak-and-Burnout Curve
Susceptibles deplete, infections peak, then everyone has either recovered with immunity or escaped infection
R E A D T H E C U R V E S
S declines monotonically
as people get infected.
I rises and falls
infections happen, then recovery wins.
R rises monotonically
permanent immunity once recovered.
Final: S∞ + R∞ = 1, I∞ = 0.
Use SIR for:
measles, COVID-19 (with caveats), one-shot
misinformation events
Bottom-line R₀ > 1 → outbreak grows; the ultimate cascade size depends on R₀ and network topology.
Week 9 — Information Diffusion | C-DE422 SNA 31 / 40

---

# SIS: When Recovery Doesn't Mean Immunity
Infection persists indefinitely at an endemic equilibrium
R E A D T H E C U R V E S
Infection settles at I*
instead of dying out.
S and I oscillate briefly
then reach steady-state balance.
I* > 0 if R₀ > 1
Use SIS for:
common cold, computer viruses, recurring fashion
trends, evergreen rumors
Bottom-line the persistent endemic level is unique to SIS — SIR cannot produce this shape.
Week 9 — Information Diffusion | C-DE422 SNA 32 / 40

---

# Connecting Epidemics Back to Network Structure
Why structural network analysis matters for epidemic prediction
### ■ ### Degree distribution determines super-spreaders
○ In scale-free networks, a few high-degree hubs disproportionately drive transmission. Targeted vaccination of these nodes can break an
outbreak more efficiently than random vaccination.
### ■ ### Average distance determines how fast the wave travels
○ Small-world networks (low diameter) let outbreaks reach the entire population in a handful of hops. This is why airport networks and online
social platforms accelerate epidemics.
### ■ ### Community structure traps infection in clusters
○ Strong communities slow spread between groups; bridge nodes (high betweenness) are the gatekeepers. Removing or vaccinating bridges
is high-leverage.
### ■ ### Centrality measures (week 4) double as risk scores
○ Degree centrality flags nodes likely to be infected first; betweenness centrality flags nodes likely to spread to many others.
Week 9 — Information Diffusion | C-DE422 SNA 33 / 40

---

# P A R T # 6
# Influence Maximization

---

# The Influence Maximization Problem
Kempe, Kleinberg & Tardos, 2003 — the founding paper
T H E P R O B L E M
### Given a graph G, a diffusion model (IC or LT), and a budget k, find a seed set S### ₀ ⊂ ### V with |S### ₀### | = k that maximizes
### the expected cascade size σ(S### ₀### ).
I N P U T
### Graph G + diffusion model
### (IC or LT, plus parameters)
B U D G E T
### Integer k
### (typically much smaller than |V|)
G O A L
### Pick k nodes that maximize
### E[cascade size]
T H E C A T C H
### Choosing the optimal seed set is NP-hard. Brute-force over all C(|V|, k) subsets is infeasible. We need a smart approximation.
Week 9 — Information Diffusion | C-DE422 SNA 35 / 40

---

# Why Picking Top-Degree Nodes Fails
The naïve heuristic is intuitive but wrong
P R O B L E M : D E A D L O C K
Pick the top-2 highest-degree nodes:
### → Seeds = { E, B }
### → LT cascade size = 5/7
W H Y I T ' S S T U C K :
C needs θ = 0.6, but only B is in its neighborhood (B, F).
Pressure stuck at 0.5.
F needs θ = 0.7, but only E is in its neighborhood (C, E).
Pressure stuck at 0.5.
C waits for F. F waits for C.
Neither E nor B can break the deadlock — adding more
high-degree nodes won't help.
Week 9 — Information Diffusion | C-DE422 SNA 36 / 40

---

# The Greedy Algorithm # — # and Why It Wins Here
Pick one seed at a time, choosing whichever ADDS the most new coverage
G R E E D Y A L G O R I T H M
### S ← ### ∅
### for i = 1 to k:
pick v* ∈ V \ S that maximizes
marginal gain σ(S∪ {v}) − σ(S)
### S ← S ### ∪ ### {v*}
### return S
// σ(S) = expected cascade size with seeds S
// marginal gain = how many EXTRA
// nodes v activates that S didn't already
Naïve top-degree { E, B } → 5/7 | ### Greedy { B, C } → 7/7 (B first; then C — the seed that breaks the C/F deadlock)
Week 9 — Information Diffusion | C-DE422 SNA 37 / 40

---

# Why Greedy Works: The Submodularity Property
Diminishing returns is the deep reason greedy is provably good
S U B M O D U L A R I T Y = D I M I N I S H I N G R E T U R N S
### In plain English: ### the more you've already added, the less each new addition helps.
Formally: if S⊂ T, then σ(S∪ {v}) − σ(S) ≥ σ(T∪ {v}) − σ(T).
### Reforestation
Planting your 1st tree increases shade a lot.
Planting your 1,000th tree adds barely any new
shade.
### TV ads
First ad insertion reaches a new audience. Tenth
insertion mostly hits people who already saw it.
### Influencer marketing
First influencer reaches their followers. A second
influencer with the same followers adds little.
Theorem (Nemhauser et al., 1978): For monotone submodular functions, greedy gives a (1 − 1/e) ≈ 63% approximation to the optimum.
Week 9 — Information Diffusion | C-DE422 SNA 38 / 40

---

# P A R T # 7
# Wrap-Up & Project Tie-In

---

# Summary & What Comes Next
From mechanics to optimization — and forward to your final project
M E C H A N I C S
## IC, LT, SIR/SIS
Three mechanics for spreading. IC: stochastic,
sender-driven. LT: deterministic, receiver-driven.
SIR/SIS: epidemic with recovery.
O P T I M I Z A T I O N
## Influence Maximization
Picking k seeds to maximize cascade is NP-
hard. Greedy algorithm, exploiting
submodularity, gives (1−1/e) approximation.
I N S I G H T
## Structure matters
Same graph, same seed → wildly different
cascade size depending on the model. Choose
the model that matches the phenomenon.
P R O J E C T T I E - I N
### Influence Analysis on your project dataset.
Apply today's ideas: identify candidate seeds with PageRank/PPR (weeks 5–6), simulate IC or LT cascades from them, and compare cascade
size against the centrality rankings from earlier weeks. Discuss where degree-based heuristics agree or disagree with cascade-based influence.
N E X T W E E K ( W e e k 1 0 ) : 
Network Robustness & Attack Tolerance — random failures vs targeted attacks; the dual of today's
diffusion.
Week 9 — Information Diffusion | C-DE422 SNA 40 / 40