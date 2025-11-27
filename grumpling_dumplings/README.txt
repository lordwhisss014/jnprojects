deploy the application in openshift
import the repository
git@gitlab.com:itg-gitlab/jn-projects.git
select secret from gitlab token
buildStrategy: Docker
contextDir: grumpling_dumplings/
#add /backend for backend and add /frontend for frontend