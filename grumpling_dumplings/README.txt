deploy the application in openshift
import the repository
git@gitlab.com:itg-gitlab/jn-projects.git
select secret from gitlab token
buildStrategy: Docker
contextDir: grumpling_dumplings/
#add /backend for backend and add /frontend for frontend



#create the build yaml
#start the build
#get the imagestream from the build