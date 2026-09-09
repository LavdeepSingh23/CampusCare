## Week 1

This week was mostly about figuring out how login should even work for CampusCare. Students would log in using their college Google account, while staff like doctors, receptionists, and admins would use a regular email and password. Once that was clear, I started thinking about what we'd need to store for this — basically a Users table with the email, role, and login type, since students and staff can't really be treated the same way. Nothing was built yet, just got the basic idea straight in my head.

## Week 2

Now that the login part made sense, I sat down and made the actual entities for the account system. Ended up with:

- Users – the main login info (email, role, login type)
- Students – connected to Users, holds student-specific details
- Staff – connected to Users, holds staff-specific details
- Roles – just keeps role names consistent instead of typing them out everywhere

While setting these up, I also looked at how they connect to each other. A user in the Users table links to either a Student or a Staff record, depending on their role, and Roles decides what access they get. Also made sure the role check happens on the backend, not the frontend, so nobody can trick their way into more access.

To understand the bigger picture, I also drew a simple Level 0 diagram of the system. At this level, CampusCare is just one big process in the middle, with students and staff feeding into it from outside, and one database sitting behind it holding all the login and role info. Students send their Google login, staff send their email and password, the system checks everything against the database, and then sends back the right dashboard depending on who logged in.

## Week 3

This week was about actually building the login page to match what the database expects. Kept the design simple — one path for student Google login, another for staff login. Made sure the fields on the page, like email, line up exactly with what the Users table needs, so nothing gets lost or mismatched when it reaches the backend.

To make sure I wasn't missing any steps, I also worked out an activity diagram for what happens during login: the page opens, the user picks their role type, goes through either Google sign-in or email/password, the backend checks if it's valid, and depending on that, either shows an error or loads the right dashboard.

Along with that, I mapped out a sequence diagram too, just to see the order things actually happen in — the user enters details on the login page, the login page sends it to the backend, the backend checks the database, gets back the role and profile info, and finally sends the dashboard back to the user. Having both of these side by side made the whole flow click a lot better.

## Week 4

Last step was connecting everything together — login page, database, and roles, all in one flow. After someone logs in, the system checks the Users table first, then grabs the right details from either Students or Staff based on their role. That's what lets a student see their own dashboard and a doctor, receptionist, or admin see theirs. By the end of this week, login, database, FastAPI, and MySQL were all finally working together properly.
