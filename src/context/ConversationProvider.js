import React, { useContext, useState, useEffect, useCallback } from "react";
import useLocalStorage from "../hooks/useLocalStorage";
import { useAuth } from "./AuthProvider";
import { useSocket } from "./SocketProvider";
import { useContacts } from "./ContactProvider";
import axiosInstance from "../utils/axios";
import { toast } from "react-toastify";

const ConversationsContext = React.createContext({
  conversations: [],
  createConversation: () => {},
  sendMessage: () => {},
  selectedConversation: {},
  selectConversationIndex: () => {},
  setSelectedConversation: () => {},
  updateNameInConversation: () => {},
  msgLoading: Boolean,
  setMsgLoading: () => {},
});

export function useConversations() {
  return useContext(ConversationsContext);
}

export function ConversationsProvider({ children }) {
  const [conversations, setConversations] = useLocalStorage(
    "conversations",
    []
  );
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [selectedConversationIndex, setSelectedConversationIndex] = useState(
    null
  );
  const [msgLoading, setMsgLoading] = useState(false);

  //using contact context and user context
  const { contacts } = useContacts();
  const { user, logout, isLoggedIn } = useAuth();
  const { socket } = useSocket();

  const formattedConversations = conversations.map((conversation, index) => {
    //for messages
    const messages = conversation.messages.map((message) => {
      const fromMe = user.contactNo === message.sender.contactNo;
      return { ...message, fromMe };
    });
    const selected = index === selectedConversationIndex;
    return { ...conversation, messages, selected };
  });

  const createConversation = (recipient, cb) => {
    //create new convo post request
    const requestBody = {
      contactNo: recipient.recipientNo,
      name: recipient.recipientName,
    };
    axiosInstance
      .post(`/createnew/${user.userId}`, requestBody, {
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
      })
      .then((res) => {
        setConversations((prevConvo) => {
          return [...prevConvo, { recipient: recipient, messages: [] }];
        });
        cb();
      })
      .catch((err) => {
        console.log(err);
        if (err.response && err.response.status === 401) {
          logout();
        } else {
          toast.error(
            "Failed to create new conversation.Some error occured..."
          );
        }
      });
  };

  const addMessageToConversation = useCallback(
    (newMessage) => {
      console.log(newMessage);
      setConversations((prevConversations) => {
        let madeConvoInitially = false;
        const newConversations = prevConversations.map((convo) => {
          if (
            convo.recipient.recipientNo === newMessage.recipient.recipientNo
          ) {
            madeConvoInitially = true;
            return { ...convo, messages: [...convo.messages, newMessage] };
          }

          return convo;
        });

        if (madeConvoInitially) {
          return newConversations;
        } else {
          //when new message is recieved then it will run
          const requestBody = {
            contactNo: newMessage.recipient.recipientNo,
            name: newMessage.recipient.recipientName,
          };
          axiosInstance
            .post(`/createnew/${user.userId}`, requestBody, {
              headers: {
                Authorization: `Bearer ${user.token}`,
              },
            })
            .then((res) => {
              console.log(res);
            })
            .catch((err) => {
              console.log(err);
              if (err.response && err.response.status === 401) {
                logout();
              } else {
                toast.error(
                  "Failed to create new conversation.Some error occured..."
                );
              }
            });
          return [
            ...prevConversations,
            { recipient: newMessage.recipient, messages: [newMessage] },
          ];
        }
      });
    },
    [setConversations]
  );

  const sendMessage = (messageBody) => {
    socket.emit("send-message", messageBody);
    addMessageToConversation({
      ...messageBody,
      sender: { contactNo: user.contactNo },
    });
    setSelectedConversation((prevSelected) => {
      return {
        ...prevSelected,
        messages: [
          ...prevSelected.messages,
          {
            ...messageBody,
            fromMe: true,
            sender: { contactNo: user.contactNo },
          },
        ],
      };
    });
  };

  const updateNameInConversation = (number, name, updatedMessages) => {
    //TODO: update name in database also
    setConversations((prevConvo) => {
      return prevConvo.map((convo) => {
        if (convo.recipient.recipientNo === number) {
          return {
            ...convo,
            recipient: { ...convo.recipient, recipientName: name },
            messages: updatedMessages,
          };
        }
        return convo;
      });
    });
  };

  //for selecting a particular chat from list
  const setIndex = async (index, recipient) => {
    if (selectedConversationIndex !== index) {
      const recipientNo = recipient.recipientNo;
      const senderNo = user.contactNo;
      setSelectedConversationIndex(index);
      setMsgLoading(true);

      // fetch conversation
      try {
        const result = await axiosInstance.get(`/getconvo/${user.userId}/`, {
          headers: {
            Authorization: `Bearer ${user.token}`,
          },
          params: {
            participants: [senderNo, recipientNo],
          },
        });

        const allMessages = await result.data.allMessages.map((item) => {
          return {
            message: item.message,
            date: item.date,
            time: item.time,
            sender: { contactNo: item.sender },
            recipient: conversations[index].recipient,
          };
        });
        setConversations((allConvo) => {
          return allConvo.map((convo) => {
            if (convo.recipient.recipientNo === recipientNo) {
              return { ...convo, messages: allMessages };
            }
            return convo;
          });
        });
      } catch (err) {
        console.log(err);
        if (err.response && err.response.status === 401) {
          logout();
        } else {
          toast.error("Failed to load conversations.Some error occured...");
        }
      }
      setMsgLoading(false);
    }
  };

  //effect for not logged in
  useEffect(() => {
    if (
      Object.keys(user).length === 0 ||
      user === null ||
      user.token === null ||
      user.token === ""
    ) {
      setConversations([]);
      setSelectedConversation(null);
      setSelectedConversationIndex(null);
    }
  }, [
    user,
    setConversations,
    setSelectedConversationIndex,
    setSelectedConversation,
  ]);

  useEffect(() => {
    if (selectedConversationIndex !== null) {
      setSelectedConversation(
        formattedConversations[selectedConversationIndex]
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConversationIndex, conversations]);

  //effect for fetching chat list
  useEffect(() => {
    if (isLoggedIn) {
      axiosInstance
        .get(`/chatlist/${user.userId}`, {
          headers: {
            Authorization: `Bearer ${user.token}`,
          },
        })
        .then((res) => {
          setConversations(res.data.chatList);
        })
        .catch((err) => {
          if (err.response && err.response.status === 401) {
            logout();
          } else {
            toast.error("Some error occured. Please reload...");
          }
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, setConversations, isLoggedIn]);

  // effect for recieving message
  useEffect(() => {
    if (socket == null) return;

    socket.on("recieve-message", async (message) => {
      // const date = new Date();
      let newMessage = {
        ...message,
        //TODO://remove bug of sending time and receving time
      };
      //check if recipient already exist in contact
      // const contact = await contacts.find(
      //   (el) => el.contactNo === message.recipient.recipientNo
      // );

      //then update message
      if (message.recipient.recipientNo in contacts) {
        newMessage = {
          ...newMessage,
          recipient: {
            ...message.recipient,
            recipientName: contacts[message.recipient.recipientNo].name,
          },
        };
      }
      addMessageToConversation(newMessage);
      if (
        selectedConversation &&
        selectedConversation.recipient.recipientNo ===
          newMessage.recipient.recipientNo
      ) {
        setSelectedConversation((prevSelected) => {
          return {
            ...prevSelected,
            messages: [
              ...prevSelected.messages,
              { ...newMessage, fromMe: false },
            ],
          };
        });
      }
    });

    return () => socket.off("recieve-message");
  }, [socket, addMessageToConversation, selectedConversation, contacts]);

  return (
    <ConversationsContext.Provider
      value={{
        conversations: formattedConversations,
        createConversation,
        updateNameInConversation,
        sendMessage,
        selectedConversation: selectedConversation,
        setSelectedConversation: setSelectedConversation,
        selectConversationIndex: setIndex,
        msgLoading,
        setMsgLoading,
      }}
    >
      {children}
    </ConversationsContext.Provider>
  );
}
