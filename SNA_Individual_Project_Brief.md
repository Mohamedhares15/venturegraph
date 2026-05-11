# **C-DE422 – Big Data Engineering II** **Social Network Analytics** **Individual Project Brief**


|Instructor:|Dr. Amany Eissa|
|---|---|
|**Semester:**|Spring 2026|
|**Weight:**|25% of Final Grade|
|**Submission:**|May 4th,2026|


_C-DE422 – Big Data Engineering II: Social Network Analytics_

## **1. Project Overview**


This individual project requires you to conduct a complete, end-to-end Social Network Analysis
(SNA) on a real-world network dataset. You will demonstrate your ability to collect or acquire
network data, construct a graph representation, apply the analytical techniques covered
throughout the course, visualize your findings, and communicate actionable insights in a
professional report.


This project accounts for **25% of your final course grade** and is to be completed individually.
Collaboration on analysis or writing is not permitted.

## **2. Learning Objectives**


By completing this project, you will be able to:


   - Acquire and preprocess real-world network data into a graph structure.

   - Compute and interpret key graph measures (density, diameter, clustering coefficient).

   - Apply centrality measures (degree, closeness, betweenness, eigenvector) to identify
important nodes.

   - Perform community detection and interpret the resulting structure.

   - Conduct link prediction or influence analysis as an advanced analysis task.

   - Produce clear network visualizations using appropriate tools.

   - Build an interactive dashboard that enables users to explore and run network analytics.

   - Write a coherent analytical report that communicates findings to a non-expert audience.

## **3. Project Scope and Requirements**


**3.1 Dataset Selection**


Choose a real-world network dataset from one of the following sources, or propose your own
(subject to instructor approval):


1. **SNAP (Stanford Network Analysis Project):** snap.stanford.edu/data – social networks,

citation networks, web graphs, etc.
2. **Kaggle:** Network/graph datasets (e.g., Facebook, Twitter, collaboration networks).
3. **Self-collected:** Scrape or use an API (e.g., Twitter/X API, Reddit API, GitHub API) to

build your own network. Clearly document your data collection process.
**Minimum requirements:** The network should have at least 100 nodes and 200 edges. Larger
networks are encouraged but not required.


**3.2 Required Analysis Tasks**


Your project must include all of the following:


**Part A – Graph Construction and Exploratory Analysis**

   - Construct a network graph using NetworkX (or equivalent).

   - Report basic statistics: number of nodes, edges, density, diameter (or approximate),
average clustering coefficient, degree distribution.

   - Identify connected components and comment on the network structure.


Page 2


_C-DE422 – Big Data Engineering II: Social Network Analytics_


**Part B – Centrality Analysis**

   - Compute at least three centrality measures (e.g., degree, closeness, betweenness,
eigenvector).

   - Identify and discuss the top-5 most important nodes under each measure.

   - Compare the centrality rankings and explain any differences.


**Part C – Community Detection**

   - Apply at least one community detection algorithm (e.g., Louvain, Girvan-Newman, Label
Propagation).

   - Report the number of communities found and their sizes.

   - Visualize the communities (color-coded) and interpret the result in context.


**Part D – Advanced Analysis (choose one)**

   - **Option 1 – Link Prediction:** Apply at least two similarity-based link prediction methods
(e.g., Common Neighbors, Jaccard, Adamic-Adar). Evaluate predictions and discuss
results.

   - **Option 2 – Influence Analysis:** Use PageRank or Personalized PageRank to rank
node influence. Compare with centrality-based rankings and discuss.


**Part E – Visualization**

   - Produce at least 3 meaningful visualizations (e.g., full network graph, degree distribution
plot, community-colored layout, centrality heatmap).

   - Use tools such as NetworkX + Matplotlib, Gephi, or Pyvis.


**Part F – Interactive Dashboard**
Build an interactive dashboard that allows the instructor (or any user) to explore and run the
analytics on the network. The dashboard should:


   - Load the dataset and display the network graph interactively (zoom, pan, hover to see
node details).

   - Allow the user to select and compute different centrality measures and view the topranked nodes.

   - Allow the user to run community detection and visualize the resulting communities with
color coding.

   - Display key network statistics (node count, edge count, density, clustering coefficient,
etc.) in a summary panel.

   - **Suggested tools:** Streamlit, Dash (Plotly), Gradio, or Panel. A Streamlit app is
recommended for simplicity.

**Important:** The dashboard must be runnable from the submitted code. Include clear setup
instructions (e.g., _streamlit run app.py_ ) in a README file. The instructor will test the dashboard
as part of grading.


Page 3


_C-DE422 – Big Data Engineering II: Social Network Analytics_

## **4. Deliverables**


Submit the following as a single compressed (.zip) file:


1. **Written Report (PDF, 8–12 pages max):** Structured as: Introduction, Dataset

Description, Methodology, Results and Discussion, Conclusion. Must include all
visualizations embedded inline. ( Paper format is a plus, any innovation within the core
of the paper that may leads to some publication effort will be awarded a bonus of 5
marks in coursework grades)
2. **Code Notebook (Jupyter .ipynb or Python .py):** Clean, well-commented, and

reproducible. Include a requirements.txt or environment file.
3. **Interactive Dashboard Application:** A runnable dashboard (e.g., Streamlit, Dash, or

Gradio app) that allows the instructor to explore the network, run analytics interactively,
and view results. Include a README with setup and launch instructions.
4. **Dataset or Data Access Instructions:** Include the dataset file or a clear description of

how to obtain it (URL, API instructions).

## **5. Timeline**


   - **April 9** **[th]** **, 2026:** Submit a one-paragraph project proposal (dataset + planned analysis).
Instructor approval required before proceeding.

   - **April 21** **[st]** **, 2026:** Optional check-in. Bring preliminary results for feedback.

   - **May 4** **[th]** **, 2026:** Final submission deadline + in-class project presentations (5–7 minutes
per student).
**Note:** Office hours for discussing project deliverables, progress, and questions will be held
during tutorial times. Please come prepared with specific questions or issues to make the most
of these sessions.

## **6. Grading Rubric**


The project is graded out of 25 marks, distributed as follows:

|Component|Marks|Weight|
|---|---|---|
|Part A – Graph Construction and Exploratory Analysis|3|12%|
|Part B – Centrality Analysis|4|16%|
|Part C – Community Detection|3|12%|
|Part D – Advanced Analysis|3|12%|
|Part E – Visualization Quality|2|8%|
|Part F – Interactive Dashboard|5|20%|
|Report Quality (writing, structure, clarity)|2|8%|
|Code Quality (clean, commented, reproducible)|1|4%|
|Presentation|2|8%|



Page 4


_C-DE422 – Big Data Engineering II: Social Network Analytics_


**Total** **25** **100%**


**6.1 Detailed Rubric**

























|Criterion|Excellent (90-<br>100%)|Good (70-89%)|Satisfactory<br>(50-69%)|Needs Work<br>(<50%)|
|---|---|---|---|---|
|**Graph Construction &**<br>**Exploration (3 marks)**|Thorough stats,<br>insightful structural<br>commentary,<br>correct<br>computations.|All required stats<br>present, minor<br>gaps in<br>interpretation.|Some stats<br>missing or<br>incorrectly<br>computed.|Minimal or<br>incorrect analysis.|
|**Centrality Analysis (4**<br>**marks)**|3+ measures<br>computed<br>correctly;<br>meaningful<br>comparison; real-<br>world<br>interpretation.|3 measures with<br>correct<br>computation; some<br>comparison.|Fewer than 3<br>measures or errors<br>in computation.|Only 1 measure or<br>major errors.|
|**Community Detection**<br>**(3 marks)**|Well-chosen<br>algorithm; clear<br>visualization;<br>insightful<br>interpretation in<br>context.|Algorithm applied<br>correctly; basic<br>interpretation<br>provided.|Algorithm applied<br>but results poorly<br>explained.|Missing or<br>incorrect<br>community<br>analysis.|
|**Advanced Analysis (3**<br>**marks)**|Rigorous<br>application of<br>chosen method;<br>evaluated and<br>compared with<br>other results.|Method applied<br>correctly with<br>reasonable<br>discussion.|Method applied but<br>no evaluation or<br>comparison.|Missing or<br>fundamentally<br>flawed.|
|**Visualization (2 marks)**|3+ high-quality,<br>labeled,<br>informative visuals;<br>effective use of<br>color and layout.|3 visuals that are<br>clear and labeled.|Fewer than 3<br>visuals or poorly<br>labeled.|Missing or<br>unreadable<br>visuals.|
|**Interactive Dashboard**<br>**(5 marks)**|Fully functional;<br>loads data, runs<br>centrality and<br>community<br>detection<br>interactively; clean<br>UI; easy to launch.|Dashboard runs<br>and covers most<br>analytics; minor UI<br>or functionality<br>gaps.|Dashboard<br>partially works;<br>limited interactivity<br>or missing key<br>features.|Dashboard does<br>not run, is missing,<br>or shows only<br>static content.|
|**Report Quality (2**<br>**marks)**|Well-structured,<br>professional<br>writing; clear flow<br>from introduction to<br>conclusion.|Readable with<br>minor structural<br>issues.|Disorganized or<br>unclear writing.|No coherent<br>structure.|
|**Code Quality (1 mark)**|Clean, well-<br>commented, fully<br>reproducible.|Mostly clean; runs<br>with minor fixes.|Runs but poorly<br>organized.|Does not run or is<br>not submitted.|


Page 5




_C-DE422 – Big Data Engineering II: Social Network Analytics_





Page 6






_C-DE422 – Big Data Engineering II: Social Network Analytics_

## **7. Academic Integrity**


This is an individual project. The following rules apply:


   - All submitted work must be your own. You may discuss general concepts with
classmates but must not share code, data, or written content.

   - Use of AI tools (e.g., ChatGPT, GitHub Copilot) for code assistance is permitted, but you
must fully understand and be able to explain every part of your submission.

   - All external sources, libraries, and references must be properly cited.

   - Plagiarism in any form will result in a zero on the project and potential disciplinary action
per university policy.

## **8. Suggested Tools and Resources**


   - **Python Libraries:** NetworkX, Matplotlib, Seaborn, Pandas, python-louvain (community
detection), Pyvis (interactive visualization).

   - **Dashboard Frameworks:** Streamlit (recommended), Dash by Plotly, Gradio, or Panel.
See each framework’s documentation for quick-start guides.

   - **Visualization:** Gephi (standalone), Pyvis, or NetworkX + Matplotlib.

   - **Data Sources:** SNAP (snap.stanford.edu/data), Kaggle, Konect (konect.cc), Network
Repository (networkrepository.com).

   - **References:** Course lecture slides (Weeks 1–11), NetworkX documentation
(networkx.org).


_Good luck!_


Page 7


